"use client";

import type { OrderDto, PaymentIntentDetailDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, ordersApi, paymentsApi } from "../../lib/api";
import { formatMoney } from "../catalog/catalog-utils";
import { orderStatusClass, orderStatusLabel } from "../orders/order-ui";
import {
  clearPaymentInitializationKey,
  clearPaymentReturnContext,
  readPaymentReturnContext,
  type PaymentReturnContext,
} from "./payment-session";

export function PaymentCallbackPage() {
  const [context, setContext] = useState<PaymentReturnContext | null>(null);
  const [intent, setIntent] = useState<PaymentIntentDetailDto | null>(null);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reconcile = useCallback(async (paymentContext: PaymentReturnContext) => {
    setBusy(true);
    setMessage(null);
    try {
      const nextIntent = await paymentsApi.reconcile(paymentContext.paymentIntentId);
      const nextOrder = await ordersApi.get(paymentContext.orderId);
      setIntent(nextIntent);
      setOrder(nextOrder);
      setState("ready");

      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(nextIntent.status)) {
        clearPaymentInitializationKey(
          window.sessionStorage,
          paymentContext.paymentIntentId,
          paymentContext.channel ?? undefined,
        );
        clearPaymentReturnContext(window.sessionStorage);
      }

      if (nextIntent.status === "SUCCEEDED" && nextOrder.status === "PAID") {
        setMessage("Payment was verified server-side and the order is released for fulfillment.");
      } else if (nextIntent.status === "SUCCEEDED") {
        setMessage("Payment was verified, but fulfillment was not released. CartNest has retained the order for operational review.");
      } else if (["PROCESSING", "REQUIRES_ACTION", "PENDING"].includes(nextIntent.status)) {
        setMessage("The provider has not supplied a final verified result yet. Do not create another charge or cancel the order while this payment is unresolved.");
      } else if (nextIntent.status === "FAILED") {
        setMessage("The provider verification indicates that this payment attempt failed. A new attempt is allowed only if the order reservation is still valid.");
      } else {
        setMessage(`Current verified payment state: ${orderStatusLabel(nextIntent.status)}.`);
      }
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not verify this payment return right now."));
      setState("error");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const paymentContext = readPaymentReturnContext(window.sessionStorage);
    if (!paymentContext) {
      setState("missing");
      return;
    }
    setContext(paymentContext);
    void reconcile(paymentContext);
  }, [reconcile]);

  if (state === "loading") {
    return <main className="commercePage"><LoadingState label="Verifying payment with CartNest…" /></main>;
  }

  if (state === "missing") {
    return (
      <main className="commercePage paymentCallbackPage">
        <ErrorState
          title="Payment session not found"
          message="CartNest received a payment-provider return, but this browser no longer has the internal payment context needed to identify the order safely. Provider query parameters are not trusted as proof of payment."
          action={<Link className="primaryButton" href="/orders">Open your orders</Link>}
        />
      </main>
    );
  }

  if (state === "error" || !context) {
    return (
      <main className="commercePage paymentCallbackPage">
        <ErrorState
          title="Payment verification unavailable"
          message={message ?? "CartNest could not verify this payment return."}
          action={
            <div className="actionRow">
              <button className="secondaryButton" type="button" disabled={busy} onClick={() => void reconcile(context!)}>Try verification again</button>
              <Link className="primaryButton" href="/orders">Open orders</Link>
            </div>
          }
        />
      </main>
    );
  }

  if (!intent || !order) {
    return <main className="commercePage"><LoadingState label="Loading verified payment state…" /></main>;
  }

  const succeeded = intent.status === "SUCCEEDED";
  const paidAndReleased = succeeded && order.status === "PAID";
  const processing = ["PENDING", "REQUIRES_ACTION", "PROCESSING"].includes(intent.status);

  return (
    <main className="commercePage paymentCallbackPage">
      <div className="commerceHeader">
        <div className="commerceHeaderCopy">
          <p className="eyebrow">Order {order.orderNumber}</p>
          <h1 className="pageTitle">Payment verification</h1>
          <p className="muted">This page does not trust a browser redirect as payment proof. It asks the CartNest backend to reconcile the provider transaction before showing a result.</p>
        </div>
        <Link className="secondaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>Order details</Link>
      </div>

      {message ? <p className="formMessage" role="status">{message}</p> : null}

      <section className="panel paymentCallbackPanel" aria-live="polite">
        <div className="paymentStateHeader">
          <div>
            <p className="eyebrow">Verified payment state</p>
            <h2>{formatMoney(intent.amount)}</h2>
          </div>
          <span className={orderStatusClass(intent.status)}>{orderStatusLabel(intent.status)}</span>
        </div>

        {paidAndReleased ? (
          <div className="paymentOutcome paymentOutcomeGood">
            <strong>Payment confirmed</strong>
            <p>The provider reference, amount and currency were verified by the backend. Reserved stock was committed and the order is now paid.</p>
            <Link className="primaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>Continue to order</Link>
          </div>
        ) : succeeded ? (
          <div className="paymentOutcome paymentOutcomeWarning">
            <strong>Payment confirmed — fulfillment review required</strong>
            <p>The charge is verified, but CartNest did not release fulfillment because an inventory or financial safety gate did not pass. Do not pay again.</p>
            <Link className="primaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>View order status</Link>
          </div>
        ) : intent.status === "FAILED" ? (
          <div className="paymentOutcome paymentOutcomeDanger">
            <strong>Payment attempt failed</strong>
            <p>No successful provider result has been verified for this attempt.</p>
            <Link className="primaryButton" href={`/orders/${encodeURIComponent(order.id)}/payment`}>Return to payment</Link>
          </div>
        ) : processing ? (
          <div className="paymentOutcome paymentOutcomeWarning">
            <strong>Still verifying</strong>
            <p>The payment outcome is not final. Do not retry payment or cancel the order until reconciliation reaches a terminal state.</p>
            <button className="secondaryButton" type="button" disabled={busy} onClick={() => void reconcile(context)}>{busy ? "Checking…" : "Check again"}</button>
          </div>
        ) : (
          <div className="paymentOutcome">
            <strong>{orderStatusLabel(intent.status)}</strong>
            <p>Open the order for the latest state and available actions.</p>
            <Link className="primaryButton" href={`/orders/${encodeURIComponent(order.id)}`}>Open order</Link>
          </div>
        )}
      </section>
    </main>
  );
}
