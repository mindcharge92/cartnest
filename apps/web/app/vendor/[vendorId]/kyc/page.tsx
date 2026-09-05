"use client";

import type { VendorVerificationDto, VendorVerificationTypeDto } from "@repo/contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthGuard } from "../../../../components/auth-guard";
import { EmptyState, ErrorState, LoadingState } from "../../../../components/page-state";
import { apiErrorMessage, vendorApi } from "../../../../lib/api";
import { canManageVerification } from "../../../../features/vendor/permissions";
import { useVendorAccess } from "../../../../features/vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../../../../features/vendor/vendor-workspace-shell";

const verificationTypes: readonly { value: VendorVerificationTypeDto; label: string; note: string }[] = [
  { value: "BUSINESS", label: "Business verification", note: "Required for vendor approval." },
  { value: "IDENTITY", label: "Identity verification", note: "Required for vendor approval." },
  { value: "BANK_ACCOUNT", label: "Bank account verification", note: "Required before provider settlement can become active." },
  { value: "OTHER", label: "Other verification", note: "Use only when CartNest operations request an additional reference." },
];

export default function VendorKycPage() {
  return (
    <AuthGuard>
      <VendorKyc />
    </AuthGuard>
  );
}

function VendorKyc() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId ?? "";
  const { access, state, error, reload } = useVendorAccess(vendorId);
  const [items, setItems] = useState<readonly VendorVerificationDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<VendorVerificationTypeDto>("BUSINESS");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!access || !canManageVerification(access)) return;
    setListState("loading");
    setMessage(null);
    try {
      const result = await vendorApi.listVerifications(vendorId);
      setItems(result.items);
      setListState("ready");
    } catch (caught) {
      setListState("error");
      setMessage(apiErrorMessage(caught, "CartNest could not load vendor verification records."));
    }
  }, [access, vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <LoadingState label="Loading vendor verification…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" onClick={() => void reload()}>Try again</button>} />;
  if (!canManageVerification(access)) return <ErrorState title="Verification access restricted" message="Your vendor membership does not include verification management." />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const created = await vendorApi.submitVerification(vendorId, {
        type,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setReference("");
      setMessage(`${verificationTypes.find((item) => item.value === type)?.label ?? type} submitted for review.`);
      setListState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not submit this verification record."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Verification</p>
            <h1 className="pageTitle">Business verification</h1>
            <p className="muted">Track the verification records used by CartNest operations to approve this vendor and future settlement setup.</p>
          </div>
          <VendorStatusPill status={access.vendor.status} />
        </div>

        <div className="workspaceSplit">
          <form className="panel sellerForm" onSubmit={submit}>
            <div>
              <h2>Submit verification reference</h2>
              <p className="muted">The current P3 backend accepts a verification type and reference. Secure document-upload fields have not been defined by the backend contract yet, so the UI does not invent or store document bytes.</p>
            </div>
            <label className="field">
              Verification type
              <select value={type} onChange={(event) => setType(event.target.value as VendorVerificationTypeDto)}>
                {verificationTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <span className="fieldHint">{verificationTypes.find((item) => item.value === type)?.note}</span>
            </label>
            <label className="field">
              Reference <span className="fieldOptional">Optional when operations has not issued one</span>
              <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={500} placeholder="Reference or verification identifier" />
            </label>
            {message ? <p className="formMessage" role="status">{message}</p> : null}
            <button className="primaryButton" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
          </form>

          <section className="panel">
            <div className="sectionHeadingCompact">
              <div><h2>Verification history</h2><p>BUSINESS and IDENTITY must both reach VERIFIED before vendor approval.</p></div>
            </div>
            {listState === "loading" ? <LoadingState label="Loading verification history…" /> : null}
            {listState === "error" ? <ErrorState title="Verification history unavailable" message={message ?? "Could not load verification history."} action={<button className="secondaryButton" onClick={() => void load()}>Try again</button>} /> : null}
            {listState === "ready" && items.length === 0 ? <EmptyState title="No verification records" message="Submit the required business and identity verification references to begin review." /> : null}
            {listState === "ready" && items.length > 0 ? (
              <div className="verificationList">
                {items.map((item) => (
                  <article className="verificationRow" key={item.id}>
                    <div><strong>{item.type.replaceAll("_", " ")}</strong><small>{item.reference ?? "No reference supplied"}</small></div>
                    <div className="verificationMeta"><VendorStatusPill status={item.status} /><small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small></div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </VendorWorkspaceShell>
    </main>
  );
}
