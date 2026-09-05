"use client";

import type { StoreDto } from "@repo/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthGuard } from "../../../../../components/auth-guard";
import { ErrorState, LoadingState } from "../../../../../components/page-state";
import { apiErrorMessage, vendorApi } from "../../../../../lib/api";
import { hasVendorPermission } from "../../../../../features/vendor/permissions";
import { useVendorAccess } from "../../../../../features/vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../../../../../features/vendor/vendor-workspace-shell";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export default function VendorStoreDetailPage() {
  return (
    <AuthGuard>
      <VendorStoreDetail />
    </AuthGuard>
  );
}

function VendorStoreDetail() {
  const params = useParams<{ vendorId: string; storeId: string }>();
  const vendorId = params.vendorId ?? "";
  const storeId = params.storeId ?? "";
  const { access, state, error, reload } = useVendorAccess(vendorId);
  const [store, setStore] = useState<StoreDto | null>(null);
  const [storeState, setStoreState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const canRead = access ? hasVendorPermission(access, "store:read") : false;
  const canUpdate = access ? hasVendorPermission(access, "store:update") : false;

  const loadStore = useCallback(async () => {
    if (!access || !canRead) return;
    setStoreState("loading");
    setMessage(null);
    try {
      const result = await vendorApi.listStores(vendorId);
      const found = result.items.find((item) => item.id === storeId) ?? null;
      if (!found) {
        setStoreState("error");
        setMessage("This store was not found in your vendor workspace.");
        return;
      }
      setStore(found);
      setStoreState("ready");
    } catch (caught) {
      setStoreState("error");
      setMessage(apiErrorMessage(caught, "CartNest could not load this store."));
    }
  }, [access, canRead, storeId, vendorId]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  useEffect(() => {
    if (!store) return;
    setName(store.name);
    setSlug(store.slug);
    setDescription(store.description ?? "");
  }, [store]);

  if (state === "loading") return <LoadingState label="Loading store workspace…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" onClick={() => void reload()}>Try again</button>} />;
  if (!canRead) return <ErrorState title="Store access restricted" message="Your membership does not include permission to view stores." />;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store || !canUpdate) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await vendorApi.updateStore(store.id, {
        name: name.trim(),
        slug: slugify(slug),
        description: description.trim(),
      });
      setStore(updated);
      setMessage("Store details updated.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this store."));
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "activate" | "close") {
    if (!store || !canUpdate) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = action === "activate" ? await vendorApi.activateStore(store.id) : await vendorApi.closeStore(store.id);
      setStore(updated);
      setMessage(action === "activate" ? "Store activated." : "Store closed.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, `CartNest could not ${action} this store.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        {storeState === "loading" ? <LoadingState label="Loading store details…" /> : null}
        {storeState === "error" ? <ErrorState title="Store unavailable" message={message ?? "CartNest could not load this store."} action={<button className="secondaryButton" onClick={() => void loadStore()}>Try again</button>} /> : null}
        {storeState === "ready" && store ? (
          <>
            <div className="workspacePageHeader">
              <div>
                <p className="eyebrow">Store settings</p>
                <h1 className="pageTitle">{store.name}</h1>
                <p className="muted">Manage this storefront's public identity and lifecycle.</p>
              </div>
              <VendorStatusPill status={store.status} />
            </div>

            <form className="panel sellerForm" onSubmit={save}>
              <div className="formGrid formGridTwo">
                <label className="field">Store name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={160} disabled={!canUpdate || busy} required /></label>
                <label className="field">Store slug<input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} minLength={2} maxLength={120} disabled={!canUpdate || busy} required /></label>
              </div>
              <label className="field">Description<textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} disabled={!canUpdate || busy} /></label>
              {message ? <p className="formMessage" role="status">{message}</p> : null}
              <div className="actionRow">
                {canUpdate ? <button className="primaryButton" disabled={busy}>{busy ? "Saving…" : "Save store"}</button> : null}
                {canUpdate && store.status === "DRAFT" ? (
                  <button className="secondaryButton" type="button" disabled={busy || access.vendor.status !== "APPROVED"} onClick={() => void transition("activate")}>Activate store</button>
                ) : null}
                {canUpdate && store.status !== "CLOSED" ? <button className="dangerButton" type="button" disabled={busy} onClick={() => void transition("close")}>Close store</button> : null}
                <Link className="secondaryButton" href={`/vendor/${encodeURIComponent(vendorId)}/stores`}>Back to stores</Link>
              </div>
              {store.status === "DRAFT" && access.vendor.status !== "APPROVED" ? <p className="fieldHint">Store activation is disabled in the UI until the vendor is APPROVED. The backend enforces the same rule.</p> : null}
            </form>
          </>
        ) : null}
      </VendorWorkspaceShell>
    </main>
  );
}
