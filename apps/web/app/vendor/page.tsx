"use client";

import type { VendorAccessDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "../../components/auth-guard";
import { EmptyState, ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, vendorApi } from "../../lib/api";
import { vendorWorkspacePath } from "../../features/vendor/permissions";
import { VendorStatusPill } from "../../features/vendor/vendor-workspace-shell";

export default function VendorHomePage() {
  return (
    <AuthGuard>
      <VendorHome />
    </AuthGuard>
  );
}

function VendorHome() {
  const [items, setItems] = useState<readonly VendorAccessDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyVendorId, setBusyVendorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await vendorApi.listMine();
      setItems(result.items);
      setState("ready");
    } catch (caught) {
      setState("error");
      setError(apiErrorMessage(caught, "CartNest could not load your seller workspaces."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function acceptInvitation(access: VendorAccessDto) {
    setBusyVendorId(access.vendor.id);
    setError(null);
    try {
      const membership = await vendorApi.acceptMembership(access.vendor.id);
      setItems((current) => current.map((item) => item.vendor.id === access.vendor.id ? { ...item, membership } : item));
    } catch (caught) {
      setError(apiErrorMessage(caught, "The vendor invitation could not be accepted."));
    } finally {
      setBusyVendorId(null);
    }
  }

  if (state === "loading") return <LoadingState label="Loading your seller workspaces…" />;
  if (state === "error") return <ErrorState title="Seller workspace unavailable" message={error ?? "CartNest could not load your vendors."} action={<button className="secondaryButton" onClick={() => void load()}>Try again</button>} />;

  return (
    <main className="pageShell sellerHome">
      <div className="sellerPageHeader">
        <div>
          <p className="eyebrow">Seller workspace</p>
          <h1 className="pageTitle">Your businesses</h1>
          <p className="muted">Manage every business you own or work for from one CartNest account.</p>
        </div>
        <Link className="primaryButton" href="/vendor/onboarding">Become a seller</Link>
      </div>

      {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}

      {items.length === 0 ? (
        <EmptyState
          title="No seller workspace yet"
          message="Create a vendor application to start setting up stores, verification, products and staff."
          action={<Link className="primaryButton" href="/vendor/onboarding">Start vendor application</Link>}
        />
      ) : (
        <div className="sellerCardGrid">
          {items.map((access) => (
            <article className="sellerCard" key={access.vendor.id}>
              <div className="sellerCardTopline">
                <VendorStatusPill status={access.vendor.status} />
                <span className="statusPill">{access.membership.role}</span>
              </div>
              <div>
                <h2>{access.vendor.displayName}</h2>
                <p>{access.vendor.legalName ?? "Business profile setup in progress"}</p>
              </div>
              <div className="sellerCardMeta">
                <span>Membership: {access.membership.status.replaceAll("_", " ")}</span>
                <span>{access.membership.role === "OWNER" ? "Full vendor access" : `${access.membership.permissions.length} assigned permissions`}</span>
              </div>
              <div className="actionRow">
                {access.membership.status === "INVITED" ? (
                  <button className="primaryButton" type="button" disabled={busyVendorId === access.vendor.id} onClick={() => void acceptInvitation(access)}>
                    {busyVendorId === access.vendor.id ? "Accepting…" : "Accept invitation"}
                  </button>
                ) : (
                  <Link className="primaryButton" href={vendorWorkspacePath(access.vendor.id)}>Open workspace</Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
