# ADR-007: Payment Gateway Abstraction, Routing, Webhooks, Idempotency, Refunds, and Settlement

**Status:** Accepted  
**Accepted:** 5 September 2026  
**Gateways:** Paystack primary, Flutterwave secondary  
**Currency:** NGN first  
**Related:** ADR-005, ADR-006, ADR-010

## Decision

CartNest implements a provider-neutral payment module. **Paystack is the default provider** and **Flutterwave is the secondary/fallback provider**.

Customers do not select the gateway directly; CartNest performs internal routing.

A `PaymentIntent` represents the desired customer payment. A `PaymentAttempt` records one provider attempt. Verified webhooks and server-side verification—not browser redirects—drive final payment state.

Automatic fallback is allowed only when the prior outcome is definitively non-chargeable. Ambiguous outcomes are reconciled before another provider attempt.

## 1. Payment Domain

```text
Orders
  -> Payment Module
       -> PaymentIntent
       -> PaymentAttempt
       -> PaymentAllocation
       -> ProviderEvent
       -> Refund
       -> Settlement records/read model
       -> PaystackAdapter
       -> FlutterwaveAdapter
```

Orders and public API contracts never depend on gateway SDK-specific types.

## 2. Provider Routing

Baseline routing:

1. choose Paystack;
2. initialize attempt;
3. if initialization definitively fails before any possible charge, retry/fallback policy may choose Flutterwave;
4. if result is unknown/processing/timeout after provider acceptance, reconcile before any new charge;
5. if successful, never retry another provider.

Provider health/routing may become dynamic later without changing the payment domain contract.

## 3. Customer Gateway Choice

MVP does not expose a Paystack-vs-Flutterwave selector to the buyer. The customer chooses a payment method/channel made available by CartNest; provider selection remains an infrastructure/routing concern.

## 4. Confirmation Rule

Never trust a frontend callback alone.

Payment succeeds only after backend evidence establishes:

- authentic provider/webhook or verified provider API response;
- known attempt/reference;
- internal order/payment reference match;
- exact expected amount;
- exact expected currency;
- provider success state.

Mismatch or uncertainty cannot transition an order to paid.

## 5. Idempotency

Payment initialization and refund creation are idempotent.

Same idempotency key + same semantic request returns the same logical result. Reusing the key with conflicting payload is rejected.

Provider webhook deduplication is separate and mandatory.

## 6. Webhook Inbox

Persist provider events with:

- provider;
- external event ID where available;
- fallback fingerprint;
- event type;
- received/processed timestamp;
- linked PaymentAttempt/Refund;
- normalized processing state.

Process verified events transactionally/idempotently. A delayed duplicate event cannot undo a later authoritative state.

## 7. Paystack / Flutterwave Adapter Contract

Provider adapters expose normalized operations such as:

```ts
initialize()
verify()
refund()
verifyWebhook()
normalizeWebhook()
mapStatus()
```

Provider credentials are backend-only and provider payloads are translated before reaching domain logic.

## 8. Supported Channels

The architecture supports NGN channels such as:

- card;
- bank transfer;
- USSD;
- other approved provider channels.

Actual channel exposure is configuration/capability-driven rather than hard-coded into order entities.

## 9. Gateway Fee

MVP gateway transaction fee is allocated to the **vendor**, according to ADR-005.

The fee is explicit and snapshotted; it is not silently merged into commission.

Future business policy may change who bears fees, so the financial model stores applied policy/amount rather than assuming it forever.

## 10. Commission and Allocation

Payment allocations preserve vendor/platform economics, including:

- VendorOrder gross allocation;
- platform commission;
- gateway fee;
- delivery/tax components where relevant;
- vendor net allocation.

Commission is configurable per vendor/category and snapshotted when applied.

## 11. Vendor Settlement

Preferred provider integration uses gateway subaccounts/split settlement where supported and commercially appropriate.

Settlement is delivery-gated: funds become eligible after confirmed delivery, then move through a configurable scheduled settlement process. Baseline planning target is T+2 after delivery eligibility, subject to gateway settlement capabilities and returns/risk policy.

Internal settlement/allocation records remain authoritative for reconciliation even when the provider moves funds.

## 12. Refund Workflow

CartNest supports partial/full refunds.

```text
refund request
 -> authorization + policy + refundable balance
 -> idempotent Refund record
 -> provider refund
 -> PROCESSING
 -> provider confirmation/reconciliation
 -> SUCCEEDED / FAILED
 -> order/vendor/payment/settlement updates
```

Vendor users may perform refunds within explicit permissions/limits; admins may review/override.

## 13. Failover Matrix

| Previous Attempt Outcome | Same Provider Retry | Other Provider |
| --- | --- | --- |
| definitive pre-charge initialization failure | allowed | allowed |
| provider confirms failed/no charge | policy-based | allowed |
| timeout after provider accepted request | reconcile first | blocked until resolved |
| unknown / processing | blocked | blocked |
| succeeded | never | never |

Avoiding a duplicate customer charge is more important than instantly recovering from uncertainty.

## 14. Reconciliation

CartNest must support scheduled/manual reconciliation for:

- ambiguous attempts;
- missed/delayed webhooks;
- provider/internal amount mismatch;
- refunds stuck in processing;
- settlement discrepancy.

Discrepancies generate operational work/alerts rather than silent mutation of financial truth.

## 15. Observability

Track:

- payment initialization success by provider/channel;
- provider latency/error rate;
- webhook verification failures;
- duplicate event rate;
- ambiguous-attempt age;
- payment success/failure rate;
- refund outcomes;
- settlement discrepancies;
- amount/currency mismatch incidents.

## 16. Required Tests

- Paystack selected as default;
- safe fallback to Flutterwave on definitive non-charge failure;
- ambiguous result blocks fallback;
- duplicate initialization creates one logical intent;
- forged webhook rejected;
- duplicate webhook harmless;
- unknown reference/amount/currency mismatch cannot mark paid;
- partial refund cannot exceed remaining balance;
- duplicate refund cannot double-refund;
- settlement cannot exceed vendor net allocation;
- both provider adapters satisfy normalization contract tests.

## Final Decision

CartNest routes payments internally with Paystack primary and Flutterwave secondary, confirms payment only with backend evidence, uses safe failover, idempotent mutations and webhook deduplication, supports partial refunds, records configurable vendor/category commission, allocates gateway fees to vendors for MVP, and targets delivery-gated scheduled split settlement.
