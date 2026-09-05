# CartNest Provider-Specific Integration Specification

**Status:** Implementation reference  
**Last reviewed:** 5 September 2026  
**Providers:** Paystack, Flutterwave, GIG Logistics (GIGL), Cloudflare R2, Google OAuth

## 1. Purpose

This document translates CartNest's provider-neutral adapters into current provider-specific integration requirements. External APIs change; therefore each provider section includes authoritative documentation links and must be revalidated in sandbox immediately before implementation/release.

Provider response objects never become CartNest domain models. Every adapter maps provider-specific concepts to normalized platform types.

---

# 2. Paystack

## 2.1 Role in CartNest

- default payment provider;
- NGN customer payment initialization;
- card/bank/USSD/bank-transfer channels where enabled for the account;
- transaction verification;
- refunds;
- vendor subaccounts/split settlement where supported;
- vendor bears gateway fee under MVP business policy.

## 2.2 Base API and Authentication

Production API base:

```text
https://api.paystack.co
```

Server requests authenticate with:

```text
Authorization: Bearer <PAYSTACK_SECRET_KEY>
```

The secret key is backend-only.

## 2.3 Initialize Transaction

Current endpoint:

```text
POST /transaction/initialize
```

Relevant fields include:

```text
email
amount              # currency subunit
currency
reference            # CartNest-generated unique reference
channels?            # approved channels
callback_url?
metadata?
subaccount? / split_code? / split?
transaction_charge?
bearer?
```

CartNest supplies amount from the server-calculated PaymentIntent, never from an untrusted browser total.

Provider reference is stored on PaymentAttempt.

## 2.4 Verify Transaction

Current endpoint:

```text
GET /transaction/verify/:reference
```

Before `PaymentIntent` becomes SUCCEEDED, verify:

```text
provider status == success
reference == PaymentAttempt.providerReference
amount == expected provider amount
currency == PaymentIntent.currency
internal metadata/reference maps to expected Order/PaymentIntent
```

CartNest's stricter business rule uses exact expected amount, even if a provider's generic guidance would tolerate other cases.

## 2.5 Webhooks

Paystack sends `x-paystack-signature` containing HMAC SHA-512 of the event payload using the integration secret key.

Fastify must preserve/derive the body representation required for correct signature verification before trusting event content.

Flow:

```text
verify x-paystack-signature
-> derive/dedupe event identity
-> persist ProviderEvent
-> acknowledge promptly
-> verify transaction server-side when required
-> apply idempotent state transition
```

Optional IP allowlisting may be defense-in-depth, but signature verification remains required.

## 2.6 Refunds

Current create endpoint:

```text
POST /refund
```

Relevant fields:

```text
transaction   # provider transaction ref/id
amount?       # subunit; omit only for intentional full refund
currency?
customer_note?
merchant_note?
```

CartNest should send an explicit refund amount for its partial/full refund state machine and never exceed internal refundable balance.

## 2.7 Subaccounts and Splits

Create subaccount:

```text
POST /subaccount
```

Core inputs include business name, bank code/account number and percentage charge/configuration.

Paystack supports transaction splits and dynamic split configuration. CartNest stores resulting subaccount/split identifiers in provider-account/configuration records, not Vendor DTOs exposed to buyers.

The adapter must map the configured vendor/category commission snapshot into provider split semantics while preserving CartNest PaymentAllocation as the accounting source of truth.

## 2.8 Paystack Timeouts and Failover

A network timeout after initialization is `AMBIGUOUS`, not `FAILED`.

Do not switch to Flutterwave until verification demonstrates the Paystack attempt is non-chargeable.

## 2.9 Paystack References

- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/api/refund/
- https://paystack.com/docs/api/subaccount/
- https://paystack.com/docs/api/split/
- https://paystack.com/docs/payments/multi-split-payments/

---

# 3. Flutterwave

## 3.1 Role in CartNest

- secondary/fallback payment provider;
- NGN payment methods supported by the CartNest account;
- server-side charge verification;
- refunds;
- subaccount/split-payment capability where the account/API version supports it.

Flutterwave is never automatically used to retry an ambiguous Paystack attempt.

## 3.2 API-Version Discipline

Flutterwave currently documents newer charge APIs alongside v3 split-payment documentation. Do not mix request/authentication conventions from different API generations casually.

Before implementation:

1. confirm the CartNest Flutterwave account's enabled API version/products;
2. implement one coherent supported API surface inside `FlutterwaveAdapter`;
3. run sandbox contract tests;
4. keep version-specific code inside the adapter.

## 3.3 Current Newer-API Authentication Pattern

Current Flutterwave documentation describes client-credentials token acquisition at:

```text
POST https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
```

The returned access token is short-lived (current documentation states 10 minutes). Token acquisition/caching belongs in the server adapter.

## 3.4 Current Charge Pattern

Current newer API examples use:

```text
POST <flutterwave-api-base>/charges
Authorization: Bearer <ACCESS_TOKEN>
X-Trace-Id: <unique trace id>
X-Idempotency-Key: <unique idempotency key>
```

Typical charge fields include:

```text
reference
currency
customer_id
payment_method_id
amount
redirect_url
meta
```

The charge response may require a next action such as OTP, PIN, redirect or payment instructions.

CartNest maps this into a normalized `requiresAction`/authorization response for the web client.

## 3.5 Retrieve/Verify Charge

Current examples retrieve a charge by ID:

```text
GET <flutterwave-api-base>/charges/{chargeId}
```

Before granting value verify:

```text
status == succeeded
reference == expected PaymentAttempt reference
amount == expected amount according to adapter conversion
currency == expected currency
customer/transaction identity corresponds to the intended attempt
```

## 3.6 Webhooks

Current Flutterwave webhook documentation describes:

```text
flutterwave-signature: HMAC-SHA256(rawBody, secretHash) encoded as Base64
```

The webhook endpoint must:

- retain raw body;
- compute HMAC-SHA256 with configured secret hash;
- compare signatures safely;
- reject invalid events;
- respond HTTP 200 promptly for valid received events;
- persist/dedupe before expensive follow-up;
- verify critical transaction data through provider API before giving value.

Current docs describe a 60-second webhook timeout and optional retry behavior; CartNest should respond much faster and must not rely on retries as its only recovery mechanism.

## 3.7 Refunds

Current newer refund documentation uses a refund request with:

```text
amount
reason
charge_id
```

and supports idempotency/trace headers. CartNest stores the provider refund ID and reconciles final status asynchronously.

Partial refunds are supported provider-side, but CartNest's own remaining-refundable balance remains authoritative.

## 3.8 Split Payments

Flutterwave split-payment documentation supports Subaccounts for marketplaces and proportional split ratios.

CartNest may create/store a vendor's Flutterwave subaccount ID and use split configuration only after account/version compatibility is confirmed.

Regardless of provider settlement, internal PaymentAllocation remains mandatory.

## 3.9 Flutterwave References

- https://developer.flutterwave.com/docs/main-payment-flow
- https://developer.flutterwave.com/docs/charging-a-card
- https://developer.flutterwave.com/docs/webhooks
- https://developer.flutterwave.com/docs/refunds
- https://developer.flutterwave.com/v3.0/docs/split-payments
- https://developer.flutterwave.com/docs/best-practices

---

# 4. GIG Logistics (GIGL)

## 4.1 Role

GIGL is CartNest's first logistics adapter. Vendors may also use MANUAL/self-delivery.

GIGL's official developer page states its APIs support shipment automation and real-time tracking. Public API reference material is currently hosted through the GIG third-party ReadMe documentation.

## 4.2 Authentication

Current reference endpoints display an `access-token` header credential.

Store this token only in Fastify/worker server configuration.

## 4.3 Current Development API Host

Public reference examples currently use development endpoints under:

```text
https://dev-thirdpartynode.theagilitysystems.com
```

Production base URL/credentials must be obtained/confirmed with GIGL before live deployment rather than guessed from the development URL.

## 4.4 Station Data

Current reference:

```text
GET /localstations/get
```

Use this to synchronize/select supported local GIGL stations when the shipping UX requires station identifiers.

Cache relatively static station/reference data with a safe refresh policy.

## 4.5 Price Quote

Current reference:

```text
POST /price
```

The GIGL payload includes provider-specific concepts such as sender/receiver stations/locations, vehicle type, pickup option, customer type/code, shipment items, and delivery options.

`GiglAdapter.quote()` maps CartNest's normalized shipment request to these fields and converts the provider response into:

```ts
type ShippingQuote = {
  provider: "GIGL";
  providerQuoteRef?: string;
  amountMinor: string;
  currency: "NGN";
  serviceCode?: string;
  estimatedDelivery?: string;
};
```

Provider monetary values must be normalized deliberately into CartNest Money.

## 4.6 Shipment Creation

GIGL reference exposes shipment/pre-shipment endpoints including bulk preshipment and drop-off flows. The exact endpoint selected for CartNest domestic e-commerce depends on the contracted GIGL integration product.

The adapter public interface remains:

```text
quote
createShipment
cancelShipment (if supported)
trackShipment
getReferenceData
```

Do not expose GIGL endpoint names to order-domain code.

## 4.7 Tracking

Current reference includes mobile shipment tracking under:

```text
GET /track/mobileShipment
```

GIGL exposes provider scan/status codes. Map them to CartNest's normalized ShipmentStatus:

```text
provider accepted/pre-shipment -> BOOKED/PENDING
picked up/departed             -> PICKED_UP / IN_TRANSIT
out for delivery               -> OUT_FOR_DELIVERY
delivered                      -> DELIVERED
failed delivery                -> FAILED/IN_TRANSIT according to provider semantics
returning/returned             -> RETURNING / RETURNED
cancelled                      -> CANCELLED
```

Preserve raw provider status code in protected metadata/event history for troubleshooting, but public clients consume normalized states.

## 4.8 Failure Behavior

- provider timeout does not cancel VendorOrder;
- shipment creation uses an internal idempotency/business reference where provider capability permits;
- tracking sync retries asynchronously;
- MANUAL shipment path remains available according to vendor policy;
- duplicate tracking scans do not create duplicate business effects.

## 4.9 GIGL References

- https://giglogistics.com/developer/
- https://gig-logistics.readme.io/reference/get_localstations-get
- https://gig-logistics.readme.io/reference/post_price
- https://gig-logistics.readme.io/reference/post_capture-bulk-preshipment
- https://gig-logistics.readme.io/reference/get_track-mobileshipment

---

# 5. Cloudflare R2

## 5.1 Role

Cloudflare R2 stores Product and Store binary media. PostgreSQL stores Media metadata.

## 5.2 API

R2 provides an S3-compatible API at:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Use an S3-compatible SDK in the backend to sign object operations.

## 5.3 Presigned Uploads

Current R2 documentation supports presigned:

```text
GET
HEAD
PUT
DELETE
```

Current R2 presigned URLs do not support S3 HTML-form `POST` uploads.

CartNest upload flow uses presigned `PUT`.

Recommended production expiry:

```text
5 minutes default
```

Keep it configurable and short. R2 supports broader expiry ranges, but CartNest does not need long-lived upload authorization.

## 5.4 Upload Flow

```text
POST /api/v1/media/uploads
-> authorize vendor/store/product
-> validate requested MIME/size
-> create PENDING Media row/object key
-> Fastify signs R2 PUT URL
-> browser PUT directly to R2 S3 endpoint
-> client calls completion endpoint
-> backend HEAD/verifies object metadata
-> Media becomes ACTIVE
```

## 5.5 Object Keys

Example:

```text
vendors/<vendorId>/stores/<storeId>/products/<productId>/<mediaId>.webp
```

The backend generates keys. Original filenames are metadata only.

## 5.6 CORS

Configure R2 bucket CORS to allow only approved web origins/methods/headers required by the direct-upload flow.

Do not use `*` permissively with sensitive upload behavior.

## 5.7 Presigned URL Security

R2 documentation notes presigned URLs act as bearer tokens. Anyone possessing an unexpired URL can perform its signed operation.

Therefore:

- short expiry;
- one object key;
- one method;
- server ownership check before signing;
- never log full URL in ordinary logs;
- do not send provider credentials to browser.

Presigned URLs use the S3 API domain, not a custom public domain.

## 5.8 Public Reads

Public product media may use an approved custom domain/CDN/public access strategy. The durable database identity remains object key/Media ID, not CDN URL.

## 5.9 R2 References

- https://developers.cloudflare.com/r2/api/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- https://developers.cloudflare.com/r2/buckets/bucket-locks/

---

# 6. Google OAuth / Sign-In

## 6.1 Role

Google login is an optional MVP authentication convenience layered on the same CartNest User/AuthSession system. Google does not become the CartNest authorization authority.

## 6.2 Flow

Use server-side authorization-code/OpenID Connect behavior with a Web application OAuth client.

Minimal authentication scopes:

```text
openid
email
profile
```

Do not request Drive/Calendar/etc. scopes for sign-in.

## 6.3 Security Requirements

- exact approved redirect URI;
- HTTPS production callback;
- unpredictable `state` value and validation to prevent CSRF;
- OpenID Connect nonce when applicable through chosen library;
- client secret backend-only;
- validate issuer/audience/signature/expiry through established OAuth/OIDC library;
- map stable Google subject (`sub`) to AuthIdentity.providerSubject;
- account linking requires verified ownership rules; do not link accounts solely because an unverified arbitrary email string matches.

## 6.4 Token Storage

For sign-in only, CartNest does not need to retain Google refresh tokens for ongoing Google API access.

After Google identity verification, CartNest issues its own normal 15-minute access + 30-day rotating refresh-session credentials.

## 6.5 Google Reference

- https://developers.google.com/identity/protocols/oauth2/web-server

---

# 7. Shared Provider Adapter Requirements

Every adapter must implement:

- typed input/output internal contracts;
- request timeout;
- safe retry classification;
- provider error normalization;
- request/trace correlation;
- secret redaction;
- sandbox/test configuration;
- health/observability metrics;
- idempotency support where provider permits;
- no direct exposure of provider DTOs to web clients.

## 8. Provider Contract Testing

For every integration maintain:

- unit tests against fixture provider responses;
- malformed/error response tests;
- sandbox smoke test where provider supports it;
- webhook signature test vectors;
- timeout/ambiguous outcome test;
- mapping tests into CartNest domain states;
- regression fixture when provider behavior causes an incident.

## 9. Provider Documentation Review Gate

Before each provider adapter is considered production-ready:

- official docs reviewed within the implementation/release cycle;
- production base URL confirmed;
- account capabilities confirmed;
- sandbox credentials configured;
- webhook callback registered;
- secrets loaded through production secret management;
- rate limits/retry requirements reviewed;
- provider-specific terms/KYC/settlement requirements confirmed operationally.
