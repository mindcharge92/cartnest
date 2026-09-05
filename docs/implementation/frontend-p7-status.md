# Frontend FP7 — Payments and Verified Provider Handoff

**Status:** Source baseline implemented; runtime/browser/provider/PostgreSQL evidence pending  
**Updated:** 6 September 2026

## 1. Scope

FP7 connects buyer orders to the P7 payment domain without moving payment authority into the browser.

Implemented buyer routes:

```text
/orders/:orderId/payment
/payment/callback
```

The web application consumes the shared payment contracts through `@repo/api-client`. Normal authenticated mutations continue through the shared browser transport so cookies and CSRF headers are handled consistently.

## 2. Provider-neutral buyer flow

The buyer may request a payment method such as:

```text
card
bank
USSD
bank transfer
```

The buyer does **not** choose Paystack or Flutterwave. Provider routing remains a server responsibility:

```text
Paystack primary
  -> definite pre-charge failure only -> Flutterwave may be attempted
  -> ambiguous/unknown outcome       -> reconcile first; no fallback
```

This preserves the approved safe-failover rule and avoids double-charge behavior.

## 3. Hosted payment initialization

`/orders/:orderId/payment` now supports:

- real order and payment-intent loading;
- current reservation-deadline display;
- provider-neutral method selection;
- one stable browser idempotency key per payment intent + method;
- server-side payment initialization;
- HTTPS-only provider authorization redirects, with local HTTP allowed only for localhost development;
- explicit handling for already-paid, non-payable, expired-reservation, active-attempt and ambiguous-outcome states;
- payment reconciliation without starting another charge.

A new payment cannot be started when:

- the order is no longer unpaid/open;
- the inventory reservation is missing or expired;
- the intent is already successful;
- a `PENDING`, `REQUIRES_ACTION`, or `PROCESSING` provider attempt is active.

## 4. Callback verification

`/payment/callback` does not trust provider query parameters as evidence of payment.

Before redirecting to a provider, CartNest stores an internal session context containing:

```text
paymentIntentId
orderId
payment method/channel
storedAt
```

On return, the callback page:

1. reads that internal context;
2. asks the backend to reconcile the payment intent;
3. reloads the authoritative order;
4. renders success, failure, unresolved, or operational-review state from verified backend data.

If the browser no longer has the internal return context, the callback refuses to infer an order or successful payment from provider-controlled URL data and sends the buyer to the authenticated orders area instead.

## 5. Stale hosted-URL replay fix

FP7 identified a subtle idempotency problem: after an earlier hosted attempt eventually failed, a completed payment-initialization idempotency record could replay the old provider authorization URL if the same browser key was reused.

The fix is two-sided:

- the browser return context now remembers the original payment method so the exact initialization key can be cleared when a terminal provider result is reached;
- the payment repository now validates current order state and reservation validity **before** replaying a completed initialization response.

A cancelled order or expired reservation therefore cannot receive a stale hosted-payment replay from the server.

## 6. Payment/cancellation concurrency fix

A payment initialization and an order/vendor-order cancellation previously had a race window:

```text
payment request starts                   cancellation starts
        |                                       |
PaymentAttempt may be persisted         reservation may be released
        |                                       |
provider may accept charge              order may become cancelled
```

FP7 now serializes both operations on the parent `Order` row.

Application repository behavior:

- payment initialization locks the parent Order before reloading payable state and creating an attempt;
- buyer cancellation locks the parent Order before checking payment attempts or releasing inventory;
- vendor-order cancellation locks the same parent Order before releasing that store slice;
- reservation expiry locks the parent Order and skips expiry while any provider attempt remains unresolved.

The reviewed PostgreSQL migration source adds defense-in-depth triggers that:

- validate a PaymentAttempt against current order/payment/reservation state immediately before insert;
- reject VendorOrder cancellation while an active/possibly successful payment attempt exists;
- reject parent Order cancellation while such an attempt exists;
- reject stale payment amounts after a partial vendor-order cancellation changes the parent total.

The API maps this conflict to:

```text
409 ORDER_PAYMENT_ACTIVE
```

so buyer and vendor interfaces can explain that payment reconciliation must finish before cancellation.

## 7. Partial cancellation safety

When one vendor slice is cancelled before payment, the existing P6 behavior recalculates the parent order and payment-intent total.

FP7 adds a fallback-payment guard: a fallback attempt must still match the original initialization amount and currency after acquiring the parent Order lock. If the order total changed while the primary provider was failing, fallback is rejected rather than charging the stale amount.

Verified-success allocation also continues to exclude cancelled vendor-order slices.

## 8. Reservation expiry while payment is unresolved

The normal checkout hold is 15 minutes. However, releasing stock immediately at the deadline is unsafe when a provider attempt may still settle.

FP7 therefore treats an active provider attempt as a temporary hold-extension condition:

```text
reservation deadline reached
        |
active provider attempt?
   yes  -> keep reservation held; reconcile payment
   no   -> expire reservation and cancel unpaid order
```

If a provider later verifies success after the nominal reservation deadline, CartNest does not silently release fulfillment. The existing payment safety gate can retain the paid order for operational review instead.

## 9. Crash recovery for PENDING attempts

A process can fail after persisting a `PENDING` PaymentAttempt but before completing the provider initialization call.

Previously the reconciliation job selected only `REQUIRES_ACTION` and `PROCESSING`, which could strand that order indefinitely once cancellation was correctly blocked.

FP7 now includes `PENDING` attempts in both:

- buyer-triggered reconciliation;
- background reconciliation candidates after the configured age threshold.

Provider verification remains the authority for deciding the resulting state.

## 10. Idempotency collision hardening

The earlier repository retried every Prisma unique-constraint error recursively. A vanishingly rare provider-reference collision could therefore retry the same reference indefinitely.

The repository now retries only when it confirms the uniqueness race belongs to the expected initialization idempotency key. Other uniqueness violations escape for investigation rather than looping.

## 11. UI integration

Buyer order detail now exposes:

- **Pay securely** only when the order is payable and the reservation is live;
- **Check payment status** when a provider attempt is unresolved;
- cancellation only when no active payment attempt is visible;
- backend `ORDER_PAYMENT_ACTIVE` race recovery when state changed after the page rendered.

Vendor order detail also handles `ORDER_PAYMENT_ACTIVE` and reloads the authoritative vendor-order state rather than claiming cancellation succeeded.

Responsive payment/order styles and reduced-motion handling were added to the application shell.

## 12. Source tests

FP7 adds a pure browser-session regression suite covering:

- stable initialization keys;
- independent keys per payment method;
- fresh key generation after terminal cleanup;
- payment return-context round trip;
- legacy context compatibility;
- rejection of unknown stored payment-channel values.

Existing backend payment tests continue to cover safe Paystack -> Flutterwave fallback only after definite failure and no fallback after ambiguous primary outcome.

## 13. Runtime evidence still pending

Source implementation is not equivalent to an executed exit gate.

The following remain unverified until the repository CI/runtime blocker is resolved and provider/database environments are available:

- install;
- lint;
- typecheck;
- Vitest execution;
- Next.js production build;
- real PostgreSQL migration execution for the payment/cancellation triggers;
- concurrent payment-vs-cancellation integration test against PostgreSQL;
- Paystack sandbox hosted-payment round trip;
- Flutterwave definite-failure fallback round trip;
- signed webhook processing;
- browser callback/reconciliation behavior;
- responsive and keyboard QA.

## 14. FP7 exit-gate state

```text
Shared payments API client                    IMPLEMENTED
/order/:id payment UI                         IMPLEMENTED
Authenticated payment callback                IMPLEMENTED
Provider-neutral payment method selection     IMPLEMENTED
Stable initialization idempotency             IMPLEMENTED
Stale authorization replay protection         IMPLEMENTED
HTTPS authorization URL validation            IMPLEMENTED
Buyer reconciliation                          IMPLEMENTED
PENDING-attempt recovery                       IMPLEMENTED
Paystack-first safe fallback integration       IMPLEMENTED
Fallback stale-amount guard                    IMPLEMENTED
Buyer order -> payment integration             IMPLEMENTED
Buyer cancellation race handling              IMPLEMENTED
Vendor cancellation race handling             IMPLEMENTED
Order-row concurrency serialization            IMPLEMENTED
DB trigger defense-in-depth source             IMPLEMENTED
Active-payment reservation expiry guard        IMPLEMENTED
Responsive payment/order styles                IMPLEMENTED
Payment session regression tests               COMMITTED
Runtime build/test evidence                    NOT EXECUTED
PostgreSQL concurrency evidence                NOT EXECUTED
Provider sandbox/browser evidence              NOT EXECUTED
```

FP7 is complete at the **source-baseline level**. Runtime exit evidence remains pending.

## 15. Next frontend phase

**FP8 — fulfillment profiles, logistics selection, shipment creation, buyer tracking, vendor shipment operations, and tracking-event presentation.**
