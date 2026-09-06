"use client";

import type {
  AdminOrderOperationsDetailDto,
  AdminOrderSummaryDto,
  AdminPaymentSummaryDto,
  AdminRefundSummaryDto,
  AdminUserSummaryDto,
  NotificationChannelDto,
  NotificationStatusDto,
  OperationalNotificationDto,
  PlatformAnalyticsDto,
  PromotionDto,
  PromotionStatusDto,
  PromotionTypeDto,
  TaxRateDto,
} from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { useSession } from "../../components/session-provider";
import { adminApi, apiErrorMessage, notificationsApi } from "../../lib/api";
import { formatMoney } from "../catalog/catalog-utils";
import { orderStatusClass, orderStatusLabel } from "../orders/order-ui";

function localDateToIso(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function percentageToBps(value: string): number | undefined {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const [wholeText, fractionText = ""] = value.trim().split(".");
  const whole = Number(wholeText);
  const fraction = Number(fractionText.padEnd(2, "0"));
  const bps = whole * 100 + fraction;
  return Number.isInteger(bps) && bps >= 0 && bps <= 10000 ? bps : undefined;
}

function nairaToMinor(value: string): string | undefined {
  const trimmed = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return undefined;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

function Metric({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return <div className="panel compactPanel"><span className="commerceMeta">{label}</span><strong className="productPrice">{value}</strong></div>;
}

function AdminOverview() {
  const [analytics, setAnalytics] = useState<PlatformAnalyticsDto | null>(null);
  const [users, setUsers] = useState<readonly AdminUserSummaryDto[]>([]);
  const [orders, setOrders] = useState<readonly AdminOrderSummaryDto[]>([]);
  const [payments, setPayments] = useState<readonly AdminPaymentSummaryDto[]>([]);
  const [refunds, setRefunds] = useState<readonly AdminRefundSummaryDto[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const fromIso = localDateToIso(from);
    const toIso = localDateToIso(to, true);
    if (fromIso && toIso && new Date(fromIso) > new Date(toIso)) {
      setMessage("Analytics start date cannot be after the end date.");
      setState("error");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const [analyticsResponse, userResponse, orderResponse, paymentResponse, refundResponse] = await Promise.all([
        adminApi.getPlatformAnalytics({ ...(fromIso ? { from: fromIso } : {}), ...(toIso ? { to: toIso } : {}) }),
        adminApi.listUsers({ page: 1, pageSize: 10 }),
        adminApi.listOrders({ page: 1, pageSize: 10 }),
        adminApi.listPayments({ page: 1, pageSize: 10 }),
        adminApi.listRefunds({ page: 1, pageSize: 10 }),
      ]);
      setAnalytics(analyticsResponse);
      setUsers(userResponse.items);
      setOrders(orderResponse.items);
      setPayments(paymentResponse.items);
      setRefunds(refundResponse.items);
      setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load the admin overview."));
      setState("error");
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="commerceStack" aria-labelledby="admin-overview-heading">
      <div className="sectionHeadingCompact"><div><h2 id="admin-overview-heading">Platform overview</h2><p>Operational counts and commercial values come from server-side marketplace state.</p></div><button className="secondaryButton" type="button" disabled={state === "loading"} onClick={() => void load()}>{state === "loading" ? "Refreshing…" : "Refresh"}</button></div>
      <div className="panel compactPanel sellerForm">
        <div className="formGrid formGridTwo">
          <label className="field">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="field">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      </div>
      {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
      {state === "loading" ? <LoadingState label="Loading platform operations…" /> : null}
      {state === "error" ? <ErrorState title="Admin overview unavailable" message={message ?? "CartNest could not load platform state."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /> : null}
      {state === "ready" && analytics ? (
        <>
          <div className="analyticsGrid">
            <Metric label="Users" value={analytics.users} />
            <Metric label="Approved vendors" value={analytics.approvedVendors} />
            <Metric label="Active stores" value={analytics.activeStores} />
            <Metric label="Active products" value={analytics.activeProducts} />
            <Metric label="Orders" value={analytics.orders} />
            <Metric label="Paid orders" value={analytics.paidOrders} />
            <Metric label="GMV" value={formatMoney(analytics.grossMerchandiseValue)} />
            <Metric label="Refunded" value={formatMoney(analytics.refundedValue)} />
            <Metric label="Pending returns" value={analytics.pendingReturns} />
            <Metric label="Failed notifications" value={analytics.failedNotifications} />
          </div>

          <div className="formGrid formGridTwo">
            <article className="panel sellerForm"><h3>Recent users</h3>{users.map((user) => <div className="orderItemRow" key={user.id}><div><strong>{user.email ?? user.phone ?? user.id.slice(0, 8)}</strong><span>{user.platformRole} · {user.status}</span></div><span>{new Date(user.createdAt).toLocaleDateString()}</span></div>)}</article>
            <article className="panel sellerForm"><h3>Recent orders</h3>{orders.map((order) => <div className="orderItemRow" key={order.id}><div><strong>{order.orderNumber}</strong><span>{orderStatusLabel(order.status)} · payment {orderStatusLabel(order.paymentStatus)}</span></div><strong>{formatMoney(order.grandTotal)}</strong></div>)}</article>
            <article className="panel sellerForm"><h3>Recent payments</h3>{payments.map((payment) => <div className="orderItemRow" key={payment.id}><div><strong>{payment.id.slice(0, 8).toUpperCase()}</strong><span>{orderStatusLabel(payment.status)}</span></div><strong>{formatMoney(payment.amount)}</strong></div>)}</article>
            <article className="panel sellerForm"><h3>Recent refunds</h3>{refunds.map((refund) => <div className="orderItemRow" key={refund.id}><div><strong>{refund.id.slice(0, 8).toUpperCase()}</strong><span>{orderStatusLabel(refund.status)} · {refund.provider}</span></div><strong>{formatMoney(refund.amount)}</strong></div>)}</article>
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdminCommercialPolicy() {
  const [taxRates, setTaxRates] = useState<readonly TaxRateDto[]>([]);
  const [promotions, setPromotions] = useState<readonly PromotionDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [taxName, setTaxName] = useState("Nigeria VAT");
  const [taxPercent, setTaxPercent] = useState("7.5");
  const [taxStartsAt, setTaxStartsAt] = useState("");
  const [taxEndsAt, setTaxEndsAt] = useState("");
  const [taxActive, setTaxActive] = useState(false);
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionName, setPromotionName] = useState("");
  const [promotionType, setPromotionType] = useState<PromotionTypeDto>("PERCENTAGE");
  const [promotionValue, setPromotionValue] = useState("");
  const [promotionMinOrder, setPromotionMinOrder] = useState("");
  const [promotionMax, setPromotionMax] = useState("");
  const [promotionPerUser, setPromotionPerUser] = useState("");
  const [promotionStartsAt, setPromotionStartsAt] = useState("");
  const [promotionEndsAt, setPromotionEndsAt] = useState("");
  const [promotionStatus, setPromotionStatus] = useState<PromotionStatusDto>("DRAFT");

  const load = useCallback(async () => {
    setState("loading");
    setMessage(null);
    try {
      const [taxResponse, promotionResponse] = await Promise.all([adminApi.listTaxRates(), adminApi.listPromotions()]);
      setTaxRates(taxResponse.items);
      setPromotions(promotionResponse.items);
      setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load tax and promotion policy."));
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createTax() {
    const rateBps = percentageToBps(taxPercent);
    const startsAt = localDateTimeToIso(taxStartsAt);
    const endsAt = localDateTimeToIso(taxEndsAt);
    if (!taxName.trim() || rateBps === undefined) { setMessage("Enter a tax name and a percentage from 0 to 100 with at most two decimals."); return; }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setMessage("Tax end time must be after its start time."); return; }
    setBusyId("new-tax");
    setMessage(null);
    try {
      await adminApi.createTaxRate({ name: taxName.trim(), rateBps, ...(startsAt ? { startsAt } : {}), ...(endsAt ? { endsAt } : {}), active: taxActive });
      setTaxEndsAt("");
      setTaxActive(false);
      await load();
    } catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not create this tax policy.")); }
    finally { setBusyId(null); }
  }

  async function toggleTax(tax: TaxRateDto) {
    setBusyId(tax.id);
    setMessage(null);
    try { await adminApi.setTaxRateActive(tax.id, !tax.active); await load(); }
    catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not change this tax policy.")); }
    finally { setBusyId(null); }
  }

  async function createPromotion() {
    const startsAt = localDateTimeToIso(promotionStartsAt);
    const endsAt = localDateTimeToIso(promotionEndsAt);
    const value = promotionType === "PERCENTAGE" ? percentageToBps(promotionValue)?.toString() : nairaToMinor(promotionValue);
    const minOrderAmountMinor = promotionMinOrder ? nairaToMinor(promotionMinOrder) : undefined;
    const maxRedemptions = promotionMax ? Number(promotionMax) : undefined;
    const perUserLimit = promotionPerUser ? Number(promotionPerUser) : undefined;
    if (!promotionCode.trim() || !promotionName.trim() || !startsAt || !value || value === "0") { setMessage("Promotion code, name, valid start time, and positive discount value are required."); return; }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) { setMessage("Promotion end time must be after its start time."); return; }
    if (promotionMax && (!Number.isInteger(maxRedemptions) || (maxRedemptions ?? 0) < 1)) { setMessage("Global redemption limit must be a positive whole number."); return; }
    if (promotionPerUser && (!Number.isInteger(perUserLimit) || (perUserLimit ?? 0) < 1)) { setMessage("Per-user redemption limit must be a positive whole number."); return; }
    if (promotionMinOrder && minOrderAmountMinor === undefined) { setMessage("Minimum order amount must be a valid Naira amount."); return; }
    setBusyId("new-promotion");
    setMessage(null);
    try {
      await adminApi.createPromotion({
        code: promotionCode.trim(),
        name: promotionName.trim(),
        type: promotionType,
        value,
        ...(promotionType === "FIXED_AMOUNT" ? { currency: "NGN" } : {}),
        ...(minOrderAmountMinor !== undefined ? { minOrderAmountMinor } : {}),
        ...(maxRedemptions !== undefined ? { maxRedemptions } : {}),
        ...(perUserLimit !== undefined ? { perUserLimit } : {}),
        startsAt,
        ...(endsAt ? { endsAt } : {}),
        status: promotionStatus,
      });
      setPromotionCode(""); setPromotionName(""); setPromotionValue(""); setPromotionMinOrder(""); setPromotionMax(""); setPromotionPerUser("");
      await load();
    } catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not create this promotion.")); }
    finally { setBusyId(null); }
  }

  async function changePromotionStatus(promotion: PromotionDto, status: PromotionStatusDto) {
    setBusyId(promotion.id);
    setMessage(null);
    try { await adminApi.setPromotionStatus(promotion.id, status); await load(); }
    catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not update this promotion.")); }
    finally { setBusyId(null); }
  }

  return (
    <section className="commerceStack" aria-labelledby="commercial-policy-heading">
      <div className="sectionHeadingCompact"><div><h2 id="commercial-policy-heading">Tax & promotions</h2><p>Privileged commercial policy changes are server-authorized, MFA-gated, and audited.</p></div><button className="secondaryButton" type="button" disabled={state === "loading"} onClick={() => void load()}>{state === "loading" ? "Refreshing…" : "Refresh"}</button></div>
      {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
      {state === "loading" ? <LoadingState label="Loading commercial policy…" /> : null}
      {state === "error" ? <ErrorState title="Commercial policy unavailable" message={message ?? "CartNest could not load policy."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /> : null}
      {state === "ready" ? (
        <>
          <div className="formGrid formGridTwo">
            <article className="panel sellerForm">
              <h3>Create tax rate</h3>
              <label className="field">Policy name<input maxLength={160} value={taxName} onChange={(event) => setTaxName(event.target.value)} /></label>
              <label className="field">Rate (%)<input inputMode="decimal" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} /></label>
              <label className="field">Starts at <span className="fieldHint">Optional; server uses now if blank</span><input type="datetime-local" value={taxStartsAt} onChange={(event) => setTaxStartsAt(event.target.value)} /></label>
              <label className="field">Ends at <span className="fieldHint">Optional</span><input type="datetime-local" value={taxEndsAt} onChange={(event) => setTaxEndsAt(event.target.value)} /></label>
              <label className="field"><span><input type="checkbox" checked={taxActive} onChange={(event) => setTaxActive(event.target.checked)} /> Make this the active platform tax policy</span></label>
              <button className="primaryButton" type="button" disabled={busyId !== null} onClick={() => void createTax()}>{busyId === "new-tax" ? "Creating…" : "Create tax policy"}</button>
            </article>
            <article className="panel sellerForm">
              <h3>Tax policies</h3>
              {taxRates.length === 0 ? <p>No tax policies exist.</p> : taxRates.map((tax) => <div className="orderItemRow" key={tax.id}><div><strong>{tax.name}</strong><span>{(tax.rateBps / 100).toFixed(2)}% · starts {new Date(tax.startsAt).toLocaleString()}{tax.endsAt ? ` · ends ${new Date(tax.endsAt).toLocaleString()}` : ""}</span></div><button className={tax.active ? "dangerButton compactButton" : "secondaryButton compactButton"} type="button" disabled={busyId !== null} onClick={() => void toggleTax(tax)}>{busyId === tax.id ? "Saving…" : tax.active ? "Deactivate" : "Activate"}</button></div>)}
            </article>
          </div>

          <div className="formGrid formGridTwo">
            <article className="panel sellerForm">
              <h3>Create promotion</h3>
              <div className="formGrid formGridTwo"><label className="field">Code<input maxLength={64} value={promotionCode} onChange={(event) => setPromotionCode(event.target.value.toUpperCase())} /></label><label className="field">Name<input maxLength={160} value={promotionName} onChange={(event) => setPromotionName(event.target.value)} /></label></div>
              <div className="formGrid formGridTwo"><label className="field">Type<select value={promotionType} onChange={(event) => setPromotionType(event.target.value as PromotionTypeDto)}><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></label><label className="field">{promotionType === "PERCENTAGE" ? "Discount (%)" : "Discount (₦)"}<input inputMode="decimal" value={promotionValue} onChange={(event) => setPromotionValue(event.target.value)} /></label></div>
              <label className="field">Minimum order (₦) <span className="fieldHint">Optional</span><input inputMode="decimal" value={promotionMinOrder} onChange={(event) => setPromotionMinOrder(event.target.value)} /></label>
              <div className="formGrid formGridTwo"><label className="field">Global limit <span className="fieldHint">Optional</span><input type="number" min={1} value={promotionMax} onChange={(event) => setPromotionMax(event.target.value)} /></label><label className="field">Per-user limit <span className="fieldHint">Optional</span><input type="number" min={1} value={promotionPerUser} onChange={(event) => setPromotionPerUser(event.target.value)} /></label></div>
              <div className="formGrid formGridTwo"><label className="field">Starts at<input type="datetime-local" value={promotionStartsAt} onChange={(event) => setPromotionStartsAt(event.target.value)} /></label><label className="field">Ends at <span className="fieldHint">Optional</span><input type="datetime-local" value={promotionEndsAt} onChange={(event) => setPromotionEndsAt(event.target.value)} /></label></div>
              <label className="field">Initial status<select value={promotionStatus} onChange={(event) => setPromotionStatus(event.target.value as PromotionStatusDto)}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="EXPIRED">Expired</option></select></label>
              <button className="primaryButton" type="button" disabled={busyId !== null} onClick={() => void createPromotion()}>{busyId === "new-promotion" ? "Creating…" : "Create promotion"}</button>
            </article>
            <article className="panel sellerForm">
              <h3>Promotions</h3>
              {promotions.length === 0 ? <p>No promotions exist.</p> : promotions.map((promotion) => <div className="sellerForm" key={promotion.id}><div className="sectionHeadingCompact"><div><strong>{promotion.code} · {promotion.name}</strong><p>{promotion.type === "PERCENTAGE" ? `${(Number(promotion.value) / 100).toFixed(2)}%` : formatMoney({ amountMinor: promotion.value, currency: promotion.currency ?? "NGN" })} · starts {new Date(promotion.startsAt).toLocaleString()}</p></div><span className={orderStatusClass(promotion.status)}>{orderStatusLabel(promotion.status)}</span></div><label className="field">Status<select value={promotion.status} disabled={busyId !== null} onChange={(event) => void changePromotionStatus(promotion, event.target.value as PromotionStatusDto)}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="EXPIRED">Expired</option></select></label></div>)}
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdminOrderOperations() {
  const [orders, setOrders] = useState<readonly AdminOrderSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<AdminOrderOperationsDetailDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setState("loading"); setMessage(null);
    try {
      const response = await adminApi.listOrders({ page: 1, pageSize: 100 });
      setOrders(response.items);
      setSelectedId((current) => current && response.items.some((item) => item.id === current) ? current : (response.items[0]?.id ?? ""));
      setState("ready");
    } catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not load the admin order queue.")); setState("error"); }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); setDetailState("idle"); return; }
    setDetailState("loading"); setMessage(null);
    try { setDetail(await adminApi.getOrderOperations(selectedId)); setDetailState("ready"); }
    catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not explain this order's operational state.")); setDetailState("error"); }
  }, [selectedId]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);

  return (
    <section className="commerceStack" aria-labelledby="admin-order-ops-heading">
      <div className="sectionHeadingCompact"><div><h2 id="admin-order-ops-heading">Order operations</h2><p>Unified order/payment/refund/shipment/return evidence without direct database access.</p></div><button className="secondaryButton" type="button" disabled={state === "loading"} onClick={() => void loadOrders()}>Refresh queue</button></div>
      {state === "loading" ? <LoadingState label="Loading admin order queue…" /> : null}
      {state === "error" ? <ErrorState title="Order queue unavailable" message={message ?? "CartNest could not load orders."} action={<button className="secondaryButton" type="button" onClick={() => void loadOrders()}>Try again</button>} /> : null}
      {state === "ready" ? <div className="panel compactPanel"><label className="field">Order<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose an order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {orderStatusLabel(order.status)} · {formatMoney(order.grandTotal)}</option>)}</select></label></div> : null}
      {detailState === "loading" ? <LoadingState label="Building operational case view…" /> : null}
      {detailState === "error" ? <ErrorState title="Order operations unavailable" message={message ?? "CartNest could not load this order case."} action={<button className="secondaryButton" type="button" onClick={() => void loadDetail()}>Retry case</button>} /> : null}
      {detailState === "ready" && detail ? (
        <div className="commerceStack">
          <article className="panel sellerForm"><div className="sectionHeadingCompact"><div><p className="eyebrow">{detail.order.orderNumber}</p><h3>{formatMoney(detail.order.grandTotal)}</h3><p>User {detail.order.userId}</p></div><div className="orderBadgeRow"><span className={orderStatusClass(detail.order.status)}>{orderStatusLabel(detail.order.status)}</span><span className={orderStatusClass(detail.order.paymentStatus)}>Payment {orderStatusLabel(detail.order.paymentStatus)}</span></div></div><div className="orderMetadata"><span>Items {formatMoney(detail.order.itemSubtotal)}</span><span>Discount {formatMoney(detail.order.discount)}</span><span>Delivery {formatMoney(detail.order.delivery)}</span><span>Tax {formatMoney(detail.order.tax)}</span></div></article>
          <div className="formGrid formGridTwo">
            <article className="panel sellerForm"><h3>Vendor orders ({detail.vendorOrders.length})</h3>{detail.vendorOrders.map((item) => <div className="orderItemRow" key={item.id}><div><strong>{item.id.slice(0, 8).toUpperCase()}</strong><span>{orderStatusLabel(item.status)} · commission {formatMoney(item.commission)} · gateway {formatMoney(item.gatewayFee)}</span></div><strong>{formatMoney(item.total)}</strong></div>)}</article>
            <article className="panel sellerForm"><h3>Payment intents ({detail.paymentIntents.length})</h3>{detail.paymentIntents.map((intent) => <div className="sellerForm" key={intent.id}><div className="orderItemRow"><div><strong>{intent.id.slice(0, 8).toUpperCase()}</strong><span>{orderStatusLabel(intent.status)}</span></div><strong>{formatMoney(intent.amount)}</strong></div>{intent.attempts.map((attempt) => <p className="fieldHint" key={attempt.id}>{attempt.provider} · {orderStatusLabel(attempt.status)} · {attempt.providerReference ?? "no provider reference"}{attempt.failureCategory ? ` · ${attempt.failureCategory}` : ""}</p>)}</div>)}</article>
            <article className="panel sellerForm"><h3>Refunds ({detail.refunds.length})</h3>{detail.refunds.length === 0 ? <p>None.</p> : detail.refunds.map((refund) => <div className="orderItemRow" key={refund.id}><div><strong>{refund.id.slice(0, 8).toUpperCase()}</strong><span>{orderStatusLabel(refund.status)} · {refund.reason}</span></div><strong>{formatMoney(refund.amount)}</strong></div>)}</article>
            <article className="panel sellerForm"><h3>Shipments ({detail.shipments.length})</h3>{detail.shipments.length === 0 ? <p>None.</p> : detail.shipments.map((shipment) => <div className="orderItemRow" key={shipment.id}><div><strong>{shipment.trackingNumber ?? shipment.id.slice(0, 8).toUpperCase()}</strong><span>{shipment.provider} · {orderStatusLabel(shipment.status)}</span></div><span>{new Date(shipment.updatedAt).toLocaleString()}</span></div>)}</article>
            <article className="panel sellerForm"><h3>Returns ({detail.returns.length})</h3>{detail.returns.length === 0 ? <p>None.</p> : detail.returns.map((request) => <div className="orderItemRow" key={request.id}><div><strong>{request.id.slice(0, 8).toUpperCase()}</strong><span>{orderStatusLabel(request.status)} · {request.reason}</span></div><span>{new Date(request.requestedAt).toLocaleDateString()}</span></div>)}</article>
            <article className="panel sellerForm"><h3>Payment allocations ({detail.allocations.length})</h3>{detail.allocations.length === 0 ? <p>None.</p> : detail.allocations.map((allocation, index) => <div className="orderItemRow" key={`${allocation.paymentIntentId}-${allocation.vendorOrderId ?? "platform"}-${allocation.type}-${index}`}><div><strong>{allocation.type}</strong><span>{allocation.vendorOrderId ? `Vendor order ${allocation.vendorOrderId.slice(0, 8).toUpperCase()}` : "Platform allocation"}</span></div><strong>{formatMoney(allocation.amount)}</strong></div>)}</article>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const NOTIFICATION_STATUSES: readonly NotificationStatusDto[] = ["PENDING", "QUEUED", "SENT", "DELIVERED", "FAILED", "CANCELLED"];
const NOTIFICATION_CHANNELS: readonly NotificationChannelDto[] = ["EMAIL", "SMS", "IN_APP"];

function AdminNotificationOperations() {
  const [items, setItems] = useState<readonly OperationalNotificationDto[]>([]);
  const [status, setStatus] = useState<"" | NotificationStatusDto>("");
  const [channel, setChannel] = useState<"" | NotificationChannelDto>("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading"); setMessage(null);
    try {
      const response = await notificationsApi.listOperational({ page: 1, pageSize: 100, ...(status ? { status } : {}), ...(channel ? { channel } : {}) });
      setItems(response.items); setState("ready");
    } catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not load notification operations.")); setState("error"); }
  }, [channel, status]);

  useEffect(() => { void load(); }, [load]);

  async function retry(item: OperationalNotificationDto) {
    if (item.channel === "IN_APP" || !["FAILED", "QUEUED"].includes(item.status)) return;
    setBusyId(item.id); setMessage(null);
    try { await notificationsApi.retryOperational(item.id); await load(); }
    catch (caught) { setMessage(apiErrorMessage(caught, "CartNest could not queue this notification retry.")); }
    finally { setBusyId(null); }
  }

  return (
    <section className="commerceStack" aria-labelledby="notification-ops-heading">
      <div className="sectionHeadingCompact"><div><h2 id="notification-ops-heading">Notification operations</h2><p>Inspect provider-neutral delivery state and requeue only eligible external-channel notices.</p></div><button className="secondaryButton" type="button" disabled={state === "loading"} onClick={() => void load()}>Refresh</button></div>
      <div className="panel compactPanel"><div className="formGrid formGridTwo"><label className="field">Status<select value={status} onChange={(event) => setStatus(event.target.value as "" | NotificationStatusDto)}><option value="">All</option>{NOTIFICATION_STATUSES.map((item) => <option key={item} value={item}>{orderStatusLabel(item)}</option>)}</select></label><label className="field">Channel<select value={channel} onChange={(event) => setChannel(event.target.value as "" | NotificationChannelDto)}><option value="">All</option>{NOTIFICATION_CHANNELS.map((item) => <option key={item} value={item}>{orderStatusLabel(item)}</option>)}</select></label></div></div>
      {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
      {state === "loading" ? <LoadingState label="Loading notification queue…" /> : null}
      {state === "error" ? <ErrorState title="Notification operations unavailable" message={message ?? "CartNest could not load provider queue state."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /> : null}
      {state === "ready" ? items.map((item) => <article className="panel sellerForm" key={item.id}><div className="sectionHeadingCompact"><div><p className="eyebrow">{orderStatusLabel(item.channel)} · {item.templateKey}</p><h3>{item.recipient}</h3><p>{item.provider ?? "provider not assigned"}{item.providerRef ? ` · ${item.providerRef}` : ""}</p></div><span className={orderStatusClass(item.status)}>{orderStatusLabel(item.status)}</span></div><div className="orderMetadata"><span>Attempts {item.attempts}</span><span>Updated {new Date(item.updatedAt).toLocaleString()}</span>{item.nextAttemptAt ? <span>Next attempt {new Date(item.nextAttemptAt).toLocaleString()}</span> : null}</div>{item.lastError ? <p className="formMessage formMessageError">{item.lastError}</p> : null}{item.channel !== "IN_APP" && ["FAILED", "QUEUED"].includes(item.status) ? <div className="actionRow"><button className="secondaryButton" type="button" disabled={busyId !== null} onClick={() => void retry(item)}>{busyId === item.id ? "Requeueing…" : "Queue retry"}</button></div> : null}</article>) : null}
    </section>
  );
}

export function AdminConsole() {
  const { session, status, error, reloadSession } = useSession();
  const roleAllowed = Boolean(session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.platformRole));
  const mfaSatisfied = Boolean(session?.mfa.satisfied);
  const [section, setSection] = useState<"overview" | "orders" | "commercial" | "notifications">("overview");

  if (status === "loading") return <LoadingState label="Checking admin session…" />;
  if (status === "error") return <ErrorState title="Admin session unavailable" message={error ?? "CartNest could not verify your session."} action={<button className="secondaryButton" type="button" onClick={() => void reloadSession()}>Retry session</button>} />;
  if (!session || !roleAllowed) return <ErrorState title="Admin access required" message="This workspace is restricted to ADMIN and SUPER_ADMIN accounts." />;
  if (!mfaSatisfied) return <ErrorState title="Privileged MFA required" message="P10 administration changes and operational diagnostics require a currently MFA-satisfied admin session." action={<Link className="primaryButton" href="/mfa">Complete MFA</Link>} />;

  return (
    <main className="commercePage commerceStack">
      <div className="commerceHeader"><div className="commerceHeaderCopy"><p className="eyebrow">FP10 administration</p><h1 className="pageTitle">Marketplace operations console</h1><p>Analytics, commercial policy, order-state diagnostics, and notification operations share the same privileged server boundary.</p></div><Link className="secondaryButton" href="/admin/p9">Returns/refunds/reviews</Link></div>
      <nav className="actionRow" aria-label="Admin console sections">
        <button className={section === "overview" ? "primaryButton" : "secondaryButton"} type="button" onClick={() => setSection("overview")}>Overview</button>
        <button className={section === "orders" ? "primaryButton" : "secondaryButton"} type="button" onClick={() => setSection("orders")}>Order operations</button>
        <button className={section === "commercial" ? "primaryButton" : "secondaryButton"} type="button" onClick={() => setSection("commercial")}>Tax & promotions</button>
        <button className={section === "notifications" ? "primaryButton" : "secondaryButton"} type="button" onClick={() => setSection("notifications")}>Notifications</button>
      </nav>
      {section === "overview" ? <AdminOverview /> : null}
      {section === "orders" ? <AdminOrderOperations /> : null}
      {section === "commercial" ? <AdminCommercialPolicy /> : null}
      {section === "notifications" ? <AdminNotificationOperations /> : null}
    </main>
  );
}
