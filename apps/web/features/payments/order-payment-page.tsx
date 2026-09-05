"use client";

import type { OrderDto, PaymentChannelDto, PaymentIntentDetailDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorCode, apiErrorMessage, ordersApi, paymentsApi } from "../../lib/api";
import { formatMoney } from "../catalog/catalog-utils";
import { orderStatusClass, orderStatusLabel } from "../orders/order-ui";
import {
  clearPaymentInitializationKey,
  getOrCreatePaymentInitializationKey,
  storePaymentReturnContext,
} from "./payment-session";

const CHANNELS: readonly { value: "" | PaymentChannelDto; label: string }[] = [
  { value: "", label: "Let the secure payment page show available methods" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "ussd", label: "USSD" },
  { value: "bank_transfer", label: "Bank transfer" },
] as const;

const ACTIVE_ATTEMPT_STATUSES = new Set(["PENDING", "REQUIRES_ACTION", "PROCESSING"]);

function safeAuthorizationUrl(value: string): string {
  const url = new URL(value);
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("UNSAFE_PAYMENT_AUTHORIZATION_URL");
  }
  return url.toString();
}

function reservationExpired(order: OrderDto): boolean {
  return Boolean(
    order.reservationExpiresAt &&
    new Date(order.reservationExpiresAt).getTime() <= Date.now(),
  );
}

function hasActiveAttempt(intent: PaymentIntentDetailDto): boolean {
  return intent.attempts.some((attempt) => ACTIVE_ATTEMPT_STATUSES.has(attempt.status));
}

function canCreateAttempt(order: OrderDto, intent: PaymentIntentDetailDto): boolean {
  return (
    order.paymentStatus === "PENDING" &&
    ["PENDING_PAYMENT", "PARTIALLY_CANCELLED"].includes(order.status) &&
    Boolean(order.reservationExpiresAt) &&
    !reservationExpired(order) &&
    !hasActiveAttempt(intent) &&
    ["PENDING", "FAILED"].includes(intent.status)
  );
}

export function OrderPaymentPage({ orderId }: Readonly<{ orderId: string }>) {
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [intent, setIntent] = useState<PaymentIntentDetailDto | null>(null);
  const [channel, setChannel] = useState<"" | PaymentChannelDto>("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<"initialize" | "reconcile" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setState("loading");
    setMessage(null);
    try {
      const nextOrder = await ordersApi.get(orderId);
      const nextIntent = await paymentsApi.get(nextOrder.paymentIntent.id);
      setOrder(nextOrder);
      setIntent(nextIntent);
      setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load payment details for this order."));
      setState("error");
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  async function reconcile() {
    if (!order || !intent) return;
    setBusy("reconcile");
    setMessage(null);
    try {
      const nextIntent = await paymentsApi.reconcile(intent.id);
      const nextOrder = await ordersApi.get(order.id);
      setIntent(nextIntent);
      setOrder(nextOrder);
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(nextIntent.status)) {
        clearPaymentInitializationKey(window.sessionStorage, intent.id, channel || undefined);
      }
      if (nextIntent.status === "SUCCEEDED" && nextOrder.status === "PAID") {
        setMessage("Payment has been verified and the order is released for fulfillment.");
      } else if (nextIntent.status === "SUCCEEDED") {
        setMessage("Payment has been verified, but the order was not released for fulfillment. CartNest has flagged it for operational review.");
      } else if (["PROCESSING", "REQUIRES_ACTION", "PENDING"].includes(nextIntent.status) && hasActiveAttempt(nextIntent)) {
        setMessage("The provider has not supplied a final verified result yet. Do not start another charge while this attempt is active.");
      } else if (nextIntent.status === "FAILED") {
        setMessage("The last payment attempt failed without a successful charge. If the inventory reservation is still valid, you can start a new attempt.");
      } else {
        setMessage(`Current payment state: ${orderStatusLabel(nextIntent.status)}.`);
      }
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not reconcile this payment right now."));
    } finally {
      setBusy(null);
    }
  }

  async function initializePayment() {
    if (!order || !intent || !canCreateAttempt(order, intent)) return;
    setBusy("initialize");
    setMessage(null);
    const selectedChannel = channel || undefined;
    const storage = window.sessionStorage;
    const key = getOrCreatePaymentInitializationKey(storage, intent.id, selectedChannel);
    try {
      const response = await paymentsApi.initialize(
        intent.id,
        selectedChannel ? { channel: selectedChannel } : {},
        key,
      );
      const authorizationUrl = safeAuthorizationUrl(response.authorizationUrl);
      storePaymentReturnContext(storage, intent.id, order.id, selectedChannel);
      window.location.assign(authorizationUrl);
    } catch (caught) {
      const code = apiErrorCode(caught);
      if (["PAYMENT_INITIALIZATION_FAILED", "PAYMENT_RESERVATION_EXPIRED", "PAYMENT_NOT_PAYABLE", "PAYMENT_ALREADY_SUCCEEDED"].includes(code ?? "")) {
        clearPaymentInitializationKey(storage, intent.id, selectedChannel);
      }
      if (code === "PAYMENT_RESERVATION_EXPIRED") {
        setMessage("The 15-minute inventory reservation has expired. Do not pay this order. Return to the marketplace and create a fresh checkout.");
      } else if (["PAYMENT_ATTEMPT_ACTIVE", "PAYMENT_INITIALIZATION_IN_PROGRESS", "PAYMENT_OUTCOME_UNKNOWN"].includes(code ?? "")) {
        setMessage(`${apiErrorMessage(caught, "A payment attempt is already active.")} Use “Check payment status” instead of starting another charge.`);
        try {
          setIntent(await paymentsApi.get(intent.id));
        } catch {
          // Keep the original error. Reconciliation remains available to the buyer.
        }
      } else if (caught instanceof Error && caught.message === "UNSAFE_PAYMENT_AUTHORIZATION_URL") {
        setMessage("CartNest refused an invalid payment authorization URL. No redirect was performed.");
      } else {
        setMessage(apiErrorMessage(caught, "CartNest could not start the secure payment session."));
      }
    } finally {
      setBusy(null);
    }
  }

  const latestAttempt = useMemo(() => intent?.attempts.at(-1) ?? null, [intent]);

  if (state === "loading") return <main className="commercePage"><LoadingState label="Loading payment…" /></main>;
  if (state === "error" || !order || !intent) {
    return <main className="commercePage"><ErrorState title="Payment unavailable" message={message ?? "CartNest could not load this payment."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /></main>;
  }

  const expired = reservationExpired(order);
  const activeAttempt = hasActiveAttempt(intent);
  const payable = canCreateAttempt(order, intent);
  const paidAndReleased = order.paymentStatus === "SUCCEEDED" && order.status === "PAID";
  const paidNeedsReview = order.paymentStatus === "SUCCEEDED" && order.status !== "PAID";

  return (
    <main className="commercePage paymentPage">
      <div className="commerceHeader">
        <div className="commerceHeaderCopy">
          <p className="eyebrow">Order {order.orderNumber}</p>
          <h1 className="pageTitle">Payment</h1>
          <p className="muted">CartNest selects the payment provider. A fallback provider is used only when the primary provider has definitely failed before a charge could occur.</p>
        </div>
        <Link className="secondaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>← Order details</Link>
      </div>

      {message ? <p className="formMessage" role="status">{message}</p> : null}

      <div className="paymentLayout">
        <section className="panel paymentMainPanel">
          <div className="paymentStateHeader">
            <div>
              <p className="eyebrow">Payment intent</p>
              <h2>{formatMoney(intent.amount)}</h2>
            </div>
            <span className={orderStatusClass(intent.status)}>{orderStatusLabel(intent.status)}</span>
          </div>

          {paidAndReleased ? (
            <div className="paymentOutcome paymentOutcomeGood">
              <strong>Payment verified</strong>
              <p>The provider result was verified server-side, inventory was committed, and this order is now released for fulfillment.</p>
              <Link className="primaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>View paid order</Link>
            </div>
          ) : paidNeedsReview ? (
            <div className="paymentOutcome paymentOutcomeWarning">
              <strong>Payment received — operational review required</strong>
              <p>CartNest verified the provider payment but did not release fulfillment. This can happen when inventory reservation or financial-allocation safety checks fail.</p>
              <Link className="secondaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>View order status</Link>
            </div>
          ) : activeAttempt ? (
            <div className="paymentOutcome paymentOutcomeWarning">
              <strong>Payment verification in progress</strong>
              <p>{expired ? "The inventory deadline has passed while a provider attempt is still unresolved. Do not create another charge or cancel this order until CartNest reconciles the provider result." : "A provider attempt is active. Do not create another charge or cancel this order until CartNest has a final verified result."}</p>
              <button className="secondaryButton" type="button" disabled={busy !== null} onClick={() => void reconcile()}>{busy === "reconcile" ? "Checking…" : "Check payment status"}</button>
            </div>
          ) : expired ? (
            <div className="paymentOutcome paymentOutcomeDanger">
              <strong>Inventory reservation expired</strong>
              <p>The checkout reservation has passed its 15-minute deadline. The payment backend will reject a new initialization for this order.</p>
              <div className="actionRow"><Link className="primaryButton" href="/marketplace">Return to marketplace</Link><Link className="secondaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>View order</Link></div>
            </div>
          ) : (
            <>
              {payable ? (
                <div className="paymentActionStack">
                  <label className="field">Preferred payment method
                    <select value={channel} onChange={(event) => setChannel(event.target.value as "" | PaymentChannelDto)} disabled={busy !== null}>
                      {CHANNELS.map((option) => <option key={option.value || "auto"} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <button className="primaryButton" type="button" disabled={busy !== null} onClick={() => void initializePayment()}>
                    {busy === "initialize" ? "Starting secure payment…" : "Continue to secure payment"}
                  </button>
                  <p className="fieldHint">You choose a payment method, not a provider. CartNest keeps provider routing and safe fallback on the server.</p>
                </div>
              ) : null}

              {intent.status === "FAILED" ? (
                <div className="paymentReconcileBox">
                  <strong>Previous attempt failed</strong>
                  <p>A failed attempt can be retried only while the order reservation remains valid.</p>
                  <button className="secondaryButton" type="button" disabled={busy !== null} onClick={() => void reconcile()}>{busy === "reconcile" ? "Checking…" : "Check payment status"}</button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="commerceSummary paymentSafetyPanel">
          <h2>Payment safety</h2>
          <div className="summaryRows">
            <div className="summaryRow"><span>Order</span><strong>{orderStatusLabel(order.status)}</strong></div>
            <div className="summaryRow"><span>Order payment</span><strong>{orderStatusLabel(order.paymentStatus)}</strong></div>
            <div className="summaryRow"><span>Intent</span><strong>{orderStatusLabel(intent.status)}</strong></div>
            {latestAttempt ? <div className="summaryRow"><span>Latest provider</span><strong>{latestAttempt.provider === "PAYSTACK" ? "Paystack" : "Flutterwave"}</strong></div> : null}
          </div>
          {order.reservationExpiresAt ? <p className="fieldHint">Inventory reservation deadline: {new Date(order.reservationExpiresAt).toLocaleString()}.</p> : null}
          <p className="fieldHint">The provider callback page is not proof of payment. CartNest verifies provider reference, amount and currency on the server before marking a payment successful.</p>
        </aside>
      </div>
    </main>
  );
}
