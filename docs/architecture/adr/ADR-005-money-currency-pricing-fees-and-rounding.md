# ADR-005: Money, Currency, Pricing, Fees, Commission, Tax, and Rounding

**Status:** Accepted  
**Accepted:** 5 September 2026  
**Primary Currency:** NGN  
**Providers:** Paystack + Flutterwave  
**Risk:** High

## Decision

CartNest represents financial truth using integer minor units plus an explicit ISO currency code. For NGN, `1 naira = 100 kobo`; therefore `NGN 50,000.00 = 5,000,000 kobo`.

Persisted/accounting money must never use binary floating point.

When bigint is used internally/database-side, the API transports minor-unit amounts as decimal strings:

```json
{
  "amountMinor": "5000000",
  "currency": "NGN"
}
```

## 1. Money Value

Conceptually:

```ts
type Money = {
  amountMinor: bigint;
  currency: "NGN";
};
```

All arithmetic occurs through centralized helpers/value objects so currency mismatch, unsafe conversion, and inconsistent rounding are difficult to introduce.

## 2. Financial Components

CartNest tracks financial components separately rather than storing only a final grand total:

- item unit price and quantity;
- item/order discount allocations;
- VAT/tax allocation;
- delivery fee;
- platform commission;
- gateway transaction fee;
- vendor gross/net allocation;
- platform allocation;
- captured amount;
- refunded amount;
- settlement-eligible/settled amount.

Historical order economics are immutable snapshots.

## 3. Commission Model

MVP revenue uses percentage commission on marketplace sales.

Commission configuration supports:

1. platform default rate;
2. category override;
3. vendor override;
4. vendor + category override where business rules require it.

The implementation must define deterministic precedence. Recommended precedence:

```text
vendor+category override
  -> vendor override
  -> category override
  -> platform default
```

The rate and resulting commission amount actually used are snapshotted on the financial allocation/VendorOrder. Changing configuration later must not rewrite historical orders.

## 4. Gateway Fee Policy

MVP policy: **the vendor bears payment gateway transaction fees**.

Gateway fee must remain its own financial component. It must not be hidden by mutating product price or commission.

The policy is configurable for future business changes, but any order records the policy/amount that actually applied.

## 5. Tax / VAT

MVP supports a configurable platform-level VAT/tax percentage rather than a complex multi-jurisdiction tax engine.

Rules:

- tax policy is backend authoritative;
- tax amount is explicit and snapshotted;
- rate changes do not change historical orders;
- tax is not silently folded into commission;
- future category/vendor/jurisdiction tax rules require an explicit extension/decision.

## 6. Promotions

MVP starts with platform-controlled coupons/promotions.

The data model should permit future vendor promotions without reworking order history.

Promotion application must record enough information to explain the discount later, including code/rule identity and allocated discount amount.

## 7. Server Authority

The frontend may display estimates, but the backend recalculates checkout using current authoritative:

- catalog price;
- inventory availability;
- promotion eligibility;
- tax policy;
- delivery fee;
- commission configuration;
- gateway-fee policy where applicable.

A client-supplied total is never trusted as financial truth.

## 8. Rounding

All percentage calculations use one centralized rounding rule and round at an explicitly documented minor-unit boundary.

Allocation remainders are assigned deterministically so no kobo is silently created or lost.

Tests must include edge cases where percentages create fractional minor units.

## 9. Multi-Vendor Reconciliation

For one parent payment:

```text
Captured customer amount
  -> VendorOrder A allocation
       -> vendor gross
       -> commission
       -> gateway fee share
       -> tax/fees as applicable
       -> vendor net
  -> VendorOrder B allocation
  -> platform allocation
```

The exact components must reconcile to the customer capture.

## 10. Settlement Baseline

Preferred settlement uses gateway subaccount/split-payment facilities where provider/business requirements allow it.

Settlement becomes eligible after confirmed delivery. Operational settlement then follows a configurable schedule; baseline planning target is **T+2 after delivery eligibility**, subject to provider settlement mechanics and risk/returns policy.

CartNest must preserve its own allocation/settlement records even when the gateway performs the actual split.

## 11. Refunds

Partial and full refunds are supported.

A refund:

- references the original payment/allocation;
- cannot exceed remaining refundable amount;
- may target items or a VendorOrder;
- reverses the original economics deterministically;
- records provider confirmation separately from refund request creation;
- affects vendor settlement eligibility/balance according to policy.

Vendor refund authority is limited by explicit permission and business limits. Admin can review/override through audited operations.

## 12. Database Representation

Recommended logical pattern:

```text
amount_minor BIGINT
currency CHAR(3)
```

Use separate fields/records for commission, gateway fee, tax, discount, delivery, refund, and settlement values where accounting/reconciliation requires them.

Prisma `BigInt` values must be mapped to contract DTOs; never serialize raw Prisma models directly.

## 13. Invariants

Required invariants include:

```text
sum(item/fee/tax/discount components) == order total
sum(vendor + platform allocations) == captured amount
total refunds <= captured amount
vendor settlement <= remaining vendor net allocation
applied commission snapshot does not change after order creation
currency remains consistent inside a financial transaction
```

## 14. Testing

Test at minimum:

- exact minor-unit addition/subtraction;
- commission override precedence;
- commission rounding;
- VAT rounding;
- coupon allocation;
- gateway fee allocation;
- multi-vendor remainder allocation;
- partial refunds;
- settlement eligibility after delivery;
- provider amount/currency mismatch;
- historical snapshots after configuration changes.

## Final Decision

CartNest uses NGN integer minor units, configurable and snapshotted commission per vendor/category, vendor-borne gateway fees for MVP, configurable platform VAT, platform promotions first, deterministic financial allocation/refunds, and delivery-gated scheduled vendor settlement.
