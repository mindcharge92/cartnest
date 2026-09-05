# CartNest Notification Design Specification

**Status:** Implementation baseline  
**Last updated:** 5 September 2026  
**Channels:** email, SMS, in-app  
**Provider choice:** intentionally provider-neutral until a notification provider is selected

## 1. Purpose

Notifications communicate security, order, payment, vendor, logistics, return, and administrative events without coupling business transactions to an email/SMS vendor.

Notification delivery is asynchronous except where an authentication flow must explicitly inform the caller that a verification message could not be queued.

## 2. Principles

1. business transaction commits before ordinary notification delivery;
2. notification failure does not roll back a paid order;
3. authentication/security messages receive higher priority;
4. messages are deduplicated;
5. templates are versioned/configurable;
6. PII is minimized;
7. users can control optional notifications, but required transactional/security notices cannot be disabled when needed for service/security;
8. provider-specific payloads stay in adapters.

## 3. Architecture

```text
Domain event
  -> Notification policy
  -> create Notification row / enqueue job
  -> notifications queue
  -> provider adapter
  -> email/SMS/in-app delivery
  -> update status/provider reference
```

## 4. Notification Model

Core fields are represented by the Prisma `Notification` model:

```text
id
userId?
channel
templateKey
recipient
status
dedupeKey
payload
provider/providerRef
attempts
nextAttemptAt
sentAt/deliveredAt/failedAt
lastError
```

Do not store fully rendered sensitive message bodies indefinitely unless retention requirements justify it.

## 5. Channel Responsibilities

### Email

Best for:

- account verification;
- password reset/security notice;
- order confirmation;
- receipts/order summaries;
- vendor approval/rejection;
- refund confirmation;
- detailed operational notices.

### SMS

Use selectively because of cost and delivery variability:

- phone verification/OTP when phone verification is used;
- high-value security alert where policy requires;
- concise shipment/order events when SMS is explicitly enabled/valuable.

Routine marketing is not part of the initial notification baseline.

### In-app

Use for persistent application-visible events:

- vendor approval;
- new vendor order;
- shipment state;
- return/refund state;
- moderation result;
- operational/admin notice.

## 6. Transactional vs Optional

### Required/service notifications

Cannot be disabled when required to deliver the service/security process:

- email/phone verification;
- password reset;
- security/session alert;
- vendor verification outcome;
- payment/refund result;
- material order cancellation;
- legally/operationally necessary account notice.

### Optional preferences

May later be user-configurable:

- shipment progress SMS;
- vendor sales digest;
- product/promotional messages;
- analytics digest.

## 7. Event-to-Notification Matrix

| Event | Customer | Vendor | Admin |
| --- | --- | --- | --- |
| user.registered | verification email/SMS | — | — |
| security.password_changed | email/security notice | same user | — |
| vendor.approved | if same user: in-app/email | owner email/in-app | audit only |
| vendor.rejected | — | owner email/in-app | audit only |
| order.created | email/in-app | new VendorOrder in-app/email | — |
| payment.succeeded | receipt/in-app | paid order notice | metrics |
| payment.failed | actionable in-app/email if useful | — | alert only if systemic |
| vendor_order.shipped | email/in-app; SMS optional | status confirmation | — |
| vendor_order.delivered | in-app/email | in-app | — |
| refund.succeeded | email/in-app | vendor financial notice | audit |
| return.approved/rejected | email/in-app | vendor in-app | — |
| product.moderation_changed | — | email/in-app | audit |

## 8. Template Keys

Use stable keys independent of provider template IDs:

```text
auth.email_verification.v1
auth.phone_verification.v1
auth.password_reset.v1
auth.password_changed.v1
vendor.application_received.v1
vendor.approved.v1
vendor.rejected.v1
order.created.customer.v1
order.created.vendor.v1
payment.succeeded.customer.v1
payment.failed.customer.v1
shipment.shipped.customer.v1
shipment.delivered.customer.v1
refund.succeeded.customer.v1
return.status.customer.v1
moderation.product.vendor.v1
```

Provider template IDs are configuration mapped from these internal keys.

## 9. Template Variables

Templates receive a narrow allowlisted payload.

Example order-confirmation payload:

```json
{
  "customerName": "...",
  "orderNumber": "...",
  "amount": { "amountMinor": "5000000", "currency": "NGN" },
  "storeCount": 2,
  "orderUrl": "https://..."
}
```

Do not pass the entire User or Order ORM object into a template renderer.

## 10. Dedupe Keys

Examples:

```text
order-created:customer:<orderId>
payment-success:customer:<paymentIntentId>
vendor-order-created:<vendorOrderId>:<vendorMemberId>
refund-success:<refundId>:customer
password-reset:<resetRequestId>
```

A retry reuses the same logical Notification rather than creating unlimited duplicates.

## 11. Priority

```text
P0: security/auth OTP/reset
P1: payment/refund critical
P2: order/vendor fulfillment
P3: logistics status
P4: routine/digest/analytics
```

Worker concurrency/provider rate limit respects priority without starvation.

## 12. Retry Policy

Retry transient provider failures using the background-job standard.

Do not retry:

- invalid recipient format;
- permanently rejected recipient;
- invalid template configuration until configuration is fixed;
- provider authentication failure indefinitely.

When exhausted, status becomes FAILED and is visible operationally.

## 13. Delivery Status

Normalized states:

```text
PENDING
QUEUED
SENT
DELIVERED
FAILED
CANCELLED
```

Not every provider confirms DELIVERED. In that case SENT is the highest trustworthy state.

## 14. Provider Adapter Interface

Conceptual interface:

```ts
interface NotificationProvider {
  sendEmail(input: EmailMessage): Promise<ProviderSendResult>;
  sendSms(input: SmsMessage): Promise<ProviderSendResult>;
}
```

If separate providers are chosen per channel, split the interfaces.

Adapters must return normalized:

```text
provider reference
accepted/rejected state
retryability
safe error code
```

## 15. In-App Notifications

In-app notifications are persisted and queried through CartNest itself.

Future fields may include:

- readAt;
- action URL;
- severity/icon/category.

Initial implementation may reuse Notification records or introduce a dedicated InAppNotification read model if UX requirements grow.

## 16. Security Messages

Security notifications should avoid revealing sensitive details.

Example:

```text
Your CartNest password was changed at <time>.
If this was not you, use the account recovery process.
```

Do not include session tokens, reset secrets, full IP/device fingerprints, or provider secrets.

## 17. Verification and Reset Tokens

Notification messages carry only one-time public links/codes generated by the identity module.

The notification module does not create the authentication secret itself. It receives a short-lived delivery value/link from identity/application logic.

## 18. Order and Payment Messages

Payment email must reflect server-confirmed state only.

Never send “payment successful” based on browser redirect callback before provider verification.

Order confirmation should distinguish vendor shipment sections when customer action/status differs by store.

## 19. Vendor Notifications

A vendor owner/staff notification is sent only to members with appropriate role/permission and active membership.

Do not broadcast buyer address/phone to all vendor staff if only fulfillment staff require it.

## 20. Localization

Initial language may be English, but template keys and variables should not prevent future localization.

Do not hard-code long user-facing message copy inside domain services.

## 21. Links

- construct links from configured trusted application origin;
- never accept arbitrary redirect URL from event payload;
- security links are HTTPS in production;
- reset/verification tokens are short-lived and single-use.

## 22. Observability

Track by channel/template/provider:

```text
queued
sent
delivered
failed
retrying
latency
provider rejection
oldest queued age
```

Do not label metrics with recipient email/phone.

## 23. Testing

- domain transaction succeeds even when ordinary provider delivery fails;
- duplicate event yields one logical message;
- critical template variables render safely;
- invalid recipient produces non-retryable failure;
- transient provider error retries;
- dead-letter notification becomes visible;
- vendor messages respect permissions;
- payment-success message cannot originate from unverified browser state;
- secrets never appear in logs.

## 24. Provider Selection Gate

No email/SMS provider has been approved yet. Before implementing an adapter, create/update an integration decision containing:

- provider;
- Nigerian delivery coverage;
- pricing/limits;
- API authentication;
- sender identity requirements;
- webhook/delivery receipt support;
- data residency/privacy considerations;
- test/sandbox capability;
- outage/fallback policy.

The rest of this design remains provider-neutral.
