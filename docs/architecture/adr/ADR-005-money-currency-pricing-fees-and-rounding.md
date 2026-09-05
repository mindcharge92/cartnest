# ADR-005: Money, Currency, Pricing, Fees, and Rounding

**Status:** Proposed baseline — validate before financial implementation  
**Date:** 4 September 2026  
**Primary Currency:** NGN  
**Providers:** Paystack + Flutterwave  
**Risk:** High

## Proposed Decision

Represent monetary amounts internally as integer minor units with an explicit ISO currency code. For NGN, `1 naira = 100 kobo`. Use a database integer/bigint representation appropriate to expected limits and never floating-point for persisted/accounting amounts.

At the JSON boundary, use a safe canonical representation. When persisted as bigint, the recommended transport is a decimal string for minor units:

```json
{
  "amountMinor": "5000000",
  "currency": "NGN"
}
```

`5,000,000` kobo represents `₦50,000.00`.

## 1. Why This Matters

- Binary floating point can create rounding errors in totals, discounts, tax, commissions, and refunds.
- Payment providers commonly operate on minor units.
- Multi-vendor checkout requires deterministic allocation across vendor orders, fees, delivery, and refunds.
- A single money representation prevents frontend, backend, database, and gateway disagreement.
- Historical orders must not change when a vendor edits a current product price.

## 2. Money Value Model

Conceptual backend value object:

```ts
type Currency = "NGN";

type Money = {
  amountMinor: bigint;
  currency: Currency;
};
```

Transport contract:

```ts
const MoneySchema = Type.Object({
  amountMinor: Type.String({ pattern: "^[0-9]+$" }),
  currency: Type.Literal("NGN"),
});
```

The implementation may wrap this in a dedicated `Money` value object so arithmetic and comparison cannot silently mix currencies.

## 3. Core Rules

1. **No float persistence:** persisted/accounting amounts are not floating-point values.
2. **Currency is explicit:** never pass a naked number where currency could be ambiguous.
3. **Server totals are authoritative:** frontend may estimate/display, but checkout totals are recalculated by the backend.
4. **Provider adapters own conversion:** Paystack/Flutterwave formats are mapped inside payment adapters.
5. **Immutable snapshots:** order lines retain historical unit price, discount, tax/fee components, and relevant product identifiers.
6. **Deterministic rounding:** round at defined boundaries using one approved rule.
7. **Deterministic allocation:** the same input must produce the same vendor/platform allocation.
8. **Financial history is append/audit oriented:** current pricing rules must not rewrite historical transactions.

## 4. Pricing Components

| Component | Source | Required Behavior |
| --- | --- | --- |
| unit price | vendor/catalog | snapshotted at order time |
| quantity | cart/order | integer |
| item discount | pricing/promotion | explicit amount/rule snapshot |
| order discount | platform/promotion | deterministic allocation policy |
| delivery fee | logistics/platform | may differ per vendor shipment |
| tax/VAT | tax policy | separately represented when introduced |
| platform commission | marketplace | snapshotted/calculated per vendor order or item |
| payment fee | provider/platform policy | do not assume automatically passed to buyer |
| refund | payment/order workflow | reverses original economic allocation |

## 5. Example Calculation

```text
Item subtotal:      8,500,000 kobo
Discount:             -500,000
Delivery:              300,000
Tax (if applicable):   600,000
--------------------------------
Customer total:      8,900,000 kobo
```

Store the individual components required for reconciliation rather than only the final number.

## 6. Price Snapshot Requirements

An `OrderItem` should retain, as appropriate:

- product ID;
- variant ID;
- product/variant name snapshot;
- SKU snapshot;
- unit price;
- quantity;
- line subtotal;
- discount allocation;
- tax allocation where applicable;
- final line total;
- currency.

Later edits to product price/name must not modify historical order economics.

## 7. Multi-Vendor Allocation

One parent order can contain multiple vendor orders.

The financial system therefore needs to preserve:

```text
customer payment
  -> vendor order A allocation
  -> vendor order B allocation
  -> platform allocation/fees
```

Rules:

- parent total must reconcile with vendor/platform components;
- allocate discounts/fees through a documented deterministic algorithm;
- retain allocation records so a partial refund can reverse the original distribution;
- do not recalculate historical commissions using today's vendor settings.

## 8. Rounding Policy

The final rounding mode must be implemented centrally.

| Situation | Policy |
| --- | --- |
| percentage discount | calculate at adequate precision and round once to minor unit |
| commission | calculate then round at documented boundary |
| allocation remainder | assign deterministically; never lose/create value silently |
| refund | cannot exceed remaining refundable minor units |
| display formatting | presentation only; never changes stored amount |

## 9. Database Representation

Recommended logical columns:

```text
amount_minor BIGINT
currency CHAR(3)
```

Prisma bigint values must be mapped deliberately before JSON serialization.

Do not expose raw Prisma bigint values directly through API DTOs.

## 10. Frontend Representation

The frontend consumes the canonical transport representation and formats for display.

Example utility behavior:

```text
{ amountMinor: "5000000", currency: "NGN" }
                |
                v
            ₦50,000.00
```

Formatted strings are not sent back as the source value for financial mutations.

## 11. Provider Mapping

Payment adapters must verify what unit each provider endpoint expects and convert from the platform `Money` representation.

Provider request/response fields must not become the platform's public money model.

Before marking payment successful, verify at least:

- expected amount;
- expected currency;
- expected internal payment/order reference;
- provider transaction reference/state.

## 12. Refund Rules

- total successful refund must not exceed captured amount;
- partial refunds reduce remaining refundable balance;
- refund allocation should identify vendor order/item components where applicable;
- refund request and refund completion are different states;
- failed refund must not silently alter order totals.

## 13. Vendor Settlement

Vendor settlement is not fully designed yet, but financial records must support future settlement by preserving vendor allocations and historical commission/fee information.

Settlement must never be calculated solely from current catalog price or current commission configuration.

## 14. Financial Invariants

The following must be enforceable/testable:

```text
sum(item totals + fees - discounts + taxes) == order total
sum(vendor allocations + platform allocations) == captured customer amount
total refunded <= total captured
vendor settled <= vendor net allocation after valid deductions/refunds
currency is consistent within one financial transaction unless explicit FX is introduced
```

## 15. Testing Requirements

- exact addition/subtraction in minor units;
- percentage rounding edge cases;
- allocation remainder handling;
- very large supported amounts;
- zero values where valid;
- negative amounts rejected except internal signed adjustment models where explicitly designed;
- partial refunds;
- provider amount mismatch;
- frontend formatting does not alter canonical value.

## 16. Decisions Deferred

- VAT/tax calculation policy;
- platform commission model/tiers;
- who bears gateway fees;
- vendor payout schedule/reserve policy;
- foreign currency support;
- promotion/coupon allocation rules.

These require explicit decisions before the affected production flows are finalized.

## 17. Final Baseline

CartNest uses explicit currency + integer minor units for financial truth. The backend owns calculations, providers are adapters, order pricing is snapshotted, and all allocations/refunds must reconcile exactly.
