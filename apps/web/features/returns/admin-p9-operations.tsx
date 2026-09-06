"use client";

import type { RefundDto, ReviewDto, ReviewModerationBodyDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { useSession } from "../../components/session-provider";
import { apiErrorMessage, returnsApi } from "../../lib/api";
import { formatMoney } from "../catalog/catalog-utils";
import { orderStatusClass, orderStatusLabel } from "../orders/order-ui";

export function AdminP9Operations() {
  const { session, status: sessionStatus, error: sessionError, reloadSession } = useSession();
  const [refunds, setRefunds] = useState<readonly RefundDto[]>([]);
  const [reviews, setReviews] = useState<readonly ReviewDto[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const roleAllowed = Boolean(session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.platformRole));
  const mfaSatisfied = Boolean(session?.mfa.satisfied);

  const load = useCallback(async () => {
    if (!roleAllowed || !mfaSatisfied) return;
    setState("loading");
    setMessage(null);
    try {
      const [refundResponse, reviewResponse] = await Promise.all([
        returnsApi.listAdminRefunds({ pageSize: 100 }),
        returnsApi.listAdminReviews({ status: "PENDING", pageSize: 100 }),
      ]);
      setRefunds(refundResponse.items);
      setReviews(reviewResponse.items);
      setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load FP9 admin operations."));
      setState("error");
    }
  }, [mfaSatisfied, roleAllowed]);

  useEffect(() => { void load(); }, [load]);

  async function refundAction(refund: RefundDto, action: "approve" | "reconcile") {
    if (!roleAllowed || !mfaSatisfied) return;
    setBusyId(refund.id);
    setMessage(null);
    try {
      if (action === "approve") await returnsApi.approveRefund(refund.id);
      else await returnsApi.reconcileRefund(refund.id);
      await load();
    } catch (caught) {
      setMessage(apiErrorMessage(caught, action === "approve" ? "CartNest could not execute this refund." : "CartNest could not reconcile this refund."));
    } finally {
      setBusyId(null);
    }
  }

  async function moderate(review: ReviewDto, status: ReviewModerationBodyDto["status"]) {
    if (!roleAllowed || !mfaSatisfied) return;
    setBusyId(review.id);
    setMessage(null);
    try {
      const reason = reasons[review.id]?.trim();
      await returnsApi.moderateReview(review.id, {
        status,
        ...(reason ? { reason } : {}),
      });
      setReasons((current) => {
        const next = { ...current };
        delete next[review.id];
        return next;
      });
      await load();
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not moderate this review."));
    } finally {
      setBusyId(null);
    }
  }

  if (sessionStatus === "loading") return <LoadingState label="Checking admin session…" />;
  if (sessionStatus === "error") return <ErrorState title="Admin session unavailable" message={sessionError ?? "CartNest could not verify your session."} action={<button className="secondaryButton" type="button" onClick={() => void reloadSession()}>Retry session</button>} />;
  if (!session || !roleAllowed) return <ErrorState title="Admin access required" message="This workspace is restricted to ADMIN and SUPER_ADMIN accounts." />;
  if (!mfaSatisfied) {
    return <ErrorState title="Privileged MFA required" message="Refund execution and review moderation require a currently MFA-satisfied admin session." action={<Link className="primaryButton" href="/mfa">Complete MFA</Link>} />;
  }

  return (
    <main className="commercePage commerceStack">
      <div className="commerceHeader"><div className="commerceHeaderCopy"><p className="eyebrow">FP9 admin</p><h1 className="pageTitle">Refunds & review moderation</h1><p>Economic refund actions and moderation are protected by role checks and privileged MFA on both UI and API boundaries.</p></div><button className="secondaryButton" type="button" onClick={() => void load()} disabled={state === "loading"}>{state === "loading" ? "Refreshing…" : "Refresh"}</button></div>
      {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
      {state === "loading" ? <LoadingState label="Loading FP9 queues…" /> : null}
      {state === "error" ? <ErrorState title="Admin queues unavailable" message={message ?? "CartNest could not load admin queues."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /> : null}

      {state === "ready" ? (
        <>
          <section className="commerceStack" aria-labelledby="refund-admin-heading">
            <div className="sectionHeadingCompact"><div><h2 id="refund-admin-heading">Refund queue</h2><p>Provider execution is claimed atomically before any external refund call. PROCESSING refunds must be reconciled rather than blindly retried.</p></div><span className="statusPill">{refunds.length}</span></div>
            {refunds.length === 0 ? <div className="panel"><p>No refunds are currently recorded.</p></div> : refunds.map((refund) => (
              <article className="panel sellerForm" key={refund.id}>
                <div className="sectionHeadingCompact"><div><p className="eyebrow">Refund {refund.id.slice(0, 8).toUpperCase()}</p><h3>{formatMoney(refund.amount)}</h3><p>{refund.reason} · {refund.provider}</p></div><span className={orderStatusClass(refund.status)}>{orderStatusLabel(refund.status)}</span></div>
                <div className="orderMetadata"><span>Created {new Date(refund.createdAt).toLocaleString()}</span>{refund.providerRefundReference ? <span>Provider ref {refund.providerRefundReference}</span> : null}{refund.returnRequestId ? <span>Return {refund.returnRequestId.slice(0, 8).toUpperCase()}</span> : null}</div>
                <div className="actionRow">
                  {["REQUESTED", "APPROVED"].includes(refund.status) ? <button className="dangerButton" type="button" disabled={busyId !== null} onClick={() => void refundAction(refund, "approve")}>{busyId === refund.id ? "Executing…" : "Approve & execute"}</button> : null}
                  {refund.status === "PROCESSING" ? <button className="secondaryButton" type="button" disabled={busyId !== null || !refund.providerRefundReference} onClick={() => void refundAction(refund, "reconcile")}>{busyId === refund.id ? "Reconciling…" : "Reconcile provider state"}</button> : null}
                </div>
                {refund.status === "PROCESSING" && !refund.providerRefundReference ? <p className="fieldHint">Provider outcome is ambiguous and no reference is available. Do not issue another economic refund; investigate through the provider account.</p> : null}
              </article>
            ))}
          </section>

          <section className="commerceStack" aria-labelledby="review-admin-heading">
            <div className="sectionHeadingCompact"><div><h2 id="review-admin-heading">Pending reviews</h2><p>Only approved verified-purchase reviews are publicly visible.</p></div><span className="statusPill">{reviews.length}</span></div>
            {reviews.length === 0 ? <div className="panel"><p>No reviews are waiting for moderation.</p></div> : reviews.map((review) => (
              <article className="panel sellerForm" key={`${review.targetType}-${review.id}`}>
                <div className="sectionHeadingCompact"><div><p className="eyebrow">{orderStatusLabel(review.targetType)} review</p><h3>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</h3><p>{review.text ?? "Rating only"}</p></div><span className={orderStatusClass(review.status)}>{orderStatusLabel(review.status)}</span></div>
                <label className="field">Moderation reason <span className="fieldHint">Optional</span><input minLength={2} maxLength={1000} value={reasons[review.id] ?? ""} disabled={busyId !== null} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} /></label>
                <div className="actionRow"><button className="primaryButton" type="button" disabled={busyId !== null} onClick={() => void moderate(review, "APPROVED")}>{busyId === review.id ? "Working…" : "Approve"}</button><button className="dangerButton" type="button" disabled={busyId !== null} onClick={() => void moderate(review, "REJECTED")}>Reject</button><button className="secondaryButton" type="button" disabled={busyId !== null} onClick={() => void moderate(review, "REMOVED")}>Remove</button></div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}
