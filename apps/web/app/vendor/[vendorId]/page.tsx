"use client";

import type { PaymentProviderAccountDto, StoreDto, VendorVerificationDto } from "@repo/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "../../../components/auth-guard";
import { ErrorState, LoadingState } from "../../../components/page-state";
import { apiErrorMessage, vendorApi } from "../../../lib/api";
import { hasVendorPermission, canManageVerification } from "../../../features/vendor/permissions";
import { useVendorAccess } from "../../../features/vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../../../features/vendor/vendor-workspace-shell";

export default function VendorDashboardPage() {
  return (
    <AuthGuard>
      <VendorDashboard />
    </AuthGuard>
  );
}

function VendorDashboard() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId ?? "";
  const { access, state, error, reload, setAccess } = useVendorAccess(vendorId);
  const [stores, setStores] = useState<readonly StoreDto[]>([]);
  const [verifications, setVerifications] = useState<readonly VendorVerificationDto[]>([]);
  const [providerAccounts, setProviderAccounts] = useState<readonly PaymentProviderAccountDto[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!access || access.membership.status !== "ACTIVE") return;
    let cancelled = false;

    async function loadSummary() {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const [storeResult, verificationResult, providerResult] = await Promise.all([
          hasVendorPermission(access!, "store:read") ? vendorApi.listStores(vendorId) : Promise.resolve({ items: [] }),
          canManageVerification(access!) ? vendorApi.listVerifications(vendorId) : Promise.resolve({ items: [] }),
          hasVendorPermission(access!, "provider-account:read") ? vendorApi.listProviderAccounts(vendorId) : Promise.resolve({ items: [] }),
        ]);
        if (cancelled) return;
        setStores(storeResult.items);
        setVerifications(verificationResult.items);
        setProviderAccounts(providerResult.items);
      } catch (caught) {
        if (!cancelled) setSummaryError(apiErrorMessage(caught, "Some vendor summary data could not be loaded."));
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    void loadSummary();
    return () => { cancelled = true; };
  }, [access, vendorId]);

  if (state === "loading") return <LoadingState label="Loading vendor workspace…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" onClick={() => void reload()}>Try again</button>} />;

  async function acceptInvitation() {
    setAccepting(true);
    try {
      const membership = await vendorApi.acceptMembership(access.vendor.id);
      setAccess({ ...access, membership });
    } catch (caught) {
      setSummaryError(apiErrorMessage(caught, "The vendor invitation could not be accepted."));
    } finally {
      setAccepting(false);
    }
  }

  const businessVerified = verifications.some((item) => item.type === "BUSINESS" && item.status === "VERIFIED");
  const identityVerified = verifications.some((item) => item.type === "IDENTITY" && item.status === "VERIFIED");
  const activeStores = stores.filter((store) => store.status === "ACTIVE").length;

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Vendor overview</p>
            <h1 className="pageTitle">{access.vendor.displayName}</h1>
            <p className="muted">Business status, stores, verification and settlement-readiness in one place.</p>
          </div>
          <VendorStatusPill status={access.vendor.status} />
        </div>

        {access.membership.status === "INVITED" ? (
          <section className="calloutCard">
            <div><strong>You have been invited to this vendor.</strong><p>Accept the invitation before vendor permissions become active.</p></div>
            <button className="primaryButton" disabled={accepting} onClick={() => void acceptInvitation()}>{accepting ? "Accepting…" : "Accept invitation"}</button>
          </section>
        ) : null}

        {summaryError ? <p className="formMessage formMessageError" role="alert">{summaryError}</p> : null}
        {summaryLoading ? <p className="muted" aria-live="polite">Refreshing business summary…</p> : null}

        <div className="metricGrid">
          <article className="metricCard"><span>Vendor state</span><strong>{access.vendor.status}</strong><small>Admin approval controls selling eligibility.</small></article>
          <article className="metricCard"><span>Stores</span><strong>{stores.length}</strong><small>{activeStores} active storefront{activeStores === 1 ? "" : "s"}.</small></article>
          <article className="metricCard"><span>Required KYC</span><strong>{Number(businessVerified) + Number(identityVerified)}/2</strong><small>Business and identity verification.</small></article>
          <article className="metricCard"><span>Settlement accounts</span><strong>{providerAccounts.filter((account) => account.status === "ACTIVE").length}</strong><small>Active payment-provider accounts.</small></article>
        </div>

        <section className="workspaceSection">
          <div className="sectionHeadingCompact">
            <div><h2>Setup checklist</h2><p>These are the dependencies that determine when a vendor can operate normally.</p></div>
          </div>
          <div className="checklistGrid">
            <Link className="checklistCard" href={`/vendor/${encodeURIComponent(vendorId)}/kyc`}>
              <span className={businessVerified && identityVerified ? "checkMark checkMarkDone" : "checkMark"}>{businessVerified && identityVerified ? "✓" : "1"}</span>
              <div><strong>Complete verification</strong><p>BUSINESS and IDENTITY must be verified before vendor approval.</p></div>
            </Link>
            <Link className="checklistCard" href={`/vendor/${encodeURIComponent(vendorId)}/stores`}>
              <span className={stores.length > 0 ? "checkMark checkMarkDone" : "checkMark"}>{stores.length > 0 ? "✓" : "2"}</span>
              <div><strong>Create a store</strong><p>Prepare storefront details while approval is pending.</p></div>
            </Link>
            <div className="checklistCard checklistCardStatic">
              <span className={access.vendor.status === "APPROVED" ? "checkMark checkMarkDone" : "checkMark"}>{access.vendor.status === "APPROVED" ? "✓" : "3"}</span>
              <div><strong>Admin approval</strong><p>Approval is required before an eligible store can become active.</p></div>
            </div>
          </div>
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
