# ADR-007: Payment Gateway Abstraction, Webhooks, Idempotency, and Refunds

**Status:** Proposed baseline  
**Date:** 4 September 2026  
**Gateways:** Paystack + Flutterwave  
**Currency:** NGN first  
**Related:** ADR-005, ADR-006, ADR-010

## Proposed Decision

Implement a provider-neutral payment module with adapters for Paystack and Flutterwave.

A `PaymentIntent` represents the platform's desired customer payment. A `PaymentAttempt` records one interaction with one provider. Verified provider webhooks and server-side provider verification drive final payment confirmation.

Automatic provider fallback is allowed only when the previous attempt is known not to have charged the customer. Ambiguous outcomes must be reconciled before another charge can be attempted.

## 1. Goals

The payment design must:

- support Paystack and Flutterwave without coupling orders to provider-specific SDKs;
- prevent duplicate charges;
- survive webhook redelivery;
- verify amount and currency server-side;
- support card, bank transfer, USSD, and other channels exposed by approved providers;
- support partial/full refunds;
- preserve an auditable payment history;
- support future provider replacement or additional gateways;
- allow safe reconciliation when network/provider outcomes are uncertain.

## 2. Architecture

```text
Orders
  |
  v
Payment Module
  |
  +--> PaymentIntent
  +--> PaymentAttempt
  +--> PaymentAllocation
  +--> Refund
  +--> ProviderEvent Inbox
  |
  +--> PaystackAdapter
  +--> FlutterwaveAdapter
           |
           v
      Provider APIs/Webhooks
```

Orders know the platform payment abstraction, not Paystack/Flutterwave implementation types.

## 3. Provider Interface

Conceptual interface:

```ts
interface PaymentProvider {
  initialize(input: InitializePaymentInput): Promise<InitializePaymentResult>;
  verify(input: VerifyPaymentInput): Promise<VerifiedPaymentResult>;
  refund(input: RefundPaymentInput): Promise<RefundResult>;
  verifyWebhook(input: WebhookVerificationInput): Promise<boolean>;
  normalizeWebhook(input: unknown): NormalizedProviderEvent;
}
```

The real interface may vary, but it must normalize provider differences before they reach domain logic.

## 4. Core Payment Entities

| Entity | Purpose |
| --- | --- |
| `PaymentIntent` | one expected customer payment for an order and exact amount/currency |
| `PaymentAttempt` | one attempt using one provider/channel |
| `PaymentAllocation` | maps successful payment value to vendor orders/platform components |
| `ProviderEvent` | deduplicated webhook/inbox record |
| `Refund` | requested/processing/completed reversal |

## 5. Payment Intent

A payment intent should preserve:

- internal ID;
- parent order ID;
- expected amount;
- currency;
- state;
- idempotency context;
- created/updated timestamps.

Once created for a specific order total, the expected amount must not be silently changed after an attempt begins. If checkout economics change, create a new valid payment flow according to policy.

## 6. Payment Attempt

Each provider attempt records:

- payment intent ID;
- provider;
- provider reference;
- channel where known;
- amount/currency sent;
- normalized state;
- provider initialization metadata required for audit/reconciliation;
- timestamps;
- failure category where applicable.

Provider secret material is never exposed through public APIs.

## 7. Confirmation Rule: Never Trust the Browser

A frontend redirect/callback reporting success is not enough to mark an order paid.

A payment becomes `SUCCEEDED` only after backend evidence confirms the provider transaction matches the platform intent.

Validate at minimum:

```text
verified provider/authentic webhook
+ provider reference matches known attempt
+ internal order/payment reference matches
+ amount equals expected amount
+ currency equals expected currency
+ provider state is successful
```

Where appropriate, call the provider verification endpoint before final transition.

## 8. Initialization Flow

```text
POST /api/v1/orders/{orderId}/payment-intents
  -> authenticate customer
  -> load authorized order
  -> verify order is payable
  -> verify exact amount/currency
  -> enforce idempotency key
  -> create/find PaymentIntent
  -> select approved provider
  -> create PaymentAttempt
  -> provider.initialize(...)
  -> persist provider reference
  -> return safe authorization/checkout data
```

## 9. Webhook Flow

```text
provider webhook
  -> preserve raw body if signature requires it
  -> verify signature/authenticity
  -> reject invalid event
  -> derive provider event identity
  -> deduplicate ProviderEvent
  -> locate PaymentAttempt/Intent
  -> verify expected amount/currency/reference
  -> call provider verify endpoint when policy requires
  -> transition payment state transactionally
  -> update order/payment allocation state
  -> emit internal PaymentSucceeded/PaymentFailed event
  -> acknowledge provider quickly
```

Webhook processing must be idempotent.

## 10. Provider Event Inbox

Persist a provider-event record before/while processing so repeated delivery is safe.

Useful fields:

- provider;
- external event ID when available;
- fallback fingerprint/hash;
- event type;
- linked attempt/refund;
- received time;
- processed time;
- processing status;
- limited protected metadata.

Raw provider payload retention must follow privacy/security/retention policy.

## 11. Retry and Failover Safety

| Previous Outcome | Retry Same Provider? | Switch Provider? |
| --- | --- | --- |
| definitive initialization failure before any charge | Yes | Yes |
| provider explicitly reports failed/no charge | Policy-based | Yes |
| network timeout after initialization | Reconcile first | No automatic fallback |
| unknown/processing | No duplicate charge | No automatic fallback |
| succeeded | No | No |

The platform must prefer temporary uncertainty over risking a second customer charge.

## 12. Idempotency

Payment initialization accepts an idempotency key.

Same key + same semantic request returns the same logical payment result.

Same key + conflicting request is rejected.

Refund creation is also idempotent.

Provider webhook deduplication is separate from client idempotency and must also be implemented.

## 13. Payment State Machine

Illustrative states:

```text
PENDING
REQUIRES_ACTION
PROCESSING
SUCCEEDED
FAILED
CANCELLED
PARTIALLY_REFUNDED
REFUNDED
```

Transitions must be explicit. For example:

```text
SUCCEEDED -> FAILED
```

must not occur because a delayed duplicate failure webhook arrives after confirmed success unless the provider semantics explicitly justify a different reconciled state.

## 14. Payment Allocation

After successful payment, record how value maps to:

- each vendor order;
- platform fees/commission;
- delivery/tax components where accounting requires them.

Allocations must reconcile exactly with the captured customer amount according to ADR-005.

## 15. Refund Workflow

A refund is a separate state machine.

Suggested flow:

```text
refund request
  -> validate authorization/policy
  -> calculate remaining refundable amount
  -> create idempotent Refund
  -> provider refund request
  -> PROCESSING
  -> provider confirmation/reconciliation
  -> SUCCEEDED or FAILED
  -> update payment/order/vendor-order financial states
```

Refund request creation does not mean money has been returned.

## 16. Partial Refund Rules

- refund references original payment/allocation;
- amount cannot exceed remaining refundable value;
- refund may be attributed to item/vendor-order components;
- vendor/platform settlement implications are preserved;
- multiple partial refunds must reconcile to the original capture.

## 17. Security

- verify webhook signatures with the provider-required algorithm/raw body;
- keep provider secret keys backend-only;
- use HTTPS;
- validate amount/currency/reference;
- redact sensitive provider data from logs;
- never trust browser payment state;
- never allow a client to supply the authoritative charge amount without server recomputation;
- rotate compromised provider keys.

## 18. Reconciliation

CartNest needs a reconciliation mechanism for ambiguous/long-pending attempts.

Reconciliation may:

- query provider verification APIs;
- compare internal references and amounts;
- resolve `PROCESSING`/unknown attempts;
- detect discrepancies;
- create operational alerts rather than silently editing financial truth.

Webhook downtime must be recoverable through verification/reconciliation.

## 19. Observability

Track metrics/events such as:

- initialization success/failure by provider;
- provider latency;
- verified/invalid webhook count;
- duplicate webhook count;
- ambiguous attempt age/count;
- payment success rate;
- refund success/failure;
- amount/currency mismatch incidents.

Logs should include internal payment ID, order ID, provider reference, and request/event ID where safe.

## 20. Testing Requirements

- [ ] duplicate initialization with same idempotency key creates one logical payment intent;
- [ ] forged webhook is rejected;
- [ ] duplicate webhook is harmless;
- [ ] unknown provider reference does not mark order paid;
- [ ] amount mismatch does not mark order paid;
- [ ] currency mismatch does not mark order paid;
- [ ] success transitions order only once;
- [ ] ambiguous attempt blocks unsafe fallback;
- [ ] refund cannot exceed refundable balance;
- [ ] duplicate refund request cannot double-refund;
- [ ] both provider adapters pass normalization contract tests.

## 21. Open Decisions

- default provider selection/routing;
- whether buyer may explicitly select provider;
- exact failover policy;
- gateway fee ownership;
- settlement/payout model for vendors;
- exact card/bank transfer/USSD channel exposure in MVP;
- reconciliation schedule;
- refund authority matrix.

## 22. Final Baseline

CartNest will treat payments as an internal provider-neutral domain. Provider webhooks and server verification—not the browser—confirm payment success. Idempotency, deduplication, exact amount/currency validation, reconciliation, and safe retry classification are mandatory for financial correctness.
