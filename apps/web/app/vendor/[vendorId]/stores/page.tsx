"use client";

import type { StoreDto } from "@repo/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthGuard } from "../../../../components/auth-guard";
import { EmptyState, ErrorState, LoadingState } from "../../../../components/page-state";
import { apiErrorMessage, vendorApi } from "../../../../lib/api";
import { hasVendorPermission } from "../../../../features/vendor/permissions";
import { useVendorAccess } from "../../../../features/vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../../../../features/vendor/vendor-workspace-shell";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export default function VendorStoresPage() {
  return (
    <AuthGuard>
      <VendorStores />
    </AuthGuard>
  );
}

function VendorStores() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId ?? "";
  const { access, state, error, reload } = useVendorAccess(vendorId);
  const [stores, setStores] = useState<readonly StoreDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const canRead = access ? hasVendorPermission(access, "store:read") : false;
  const canCreate = access ? hasVendorPermission(access, "store:create") : false;

  const load = useCallback(async () => {
    if (!access || !canRead) return;
    setListState("loading");
    setMessage(null);
    try {
      const result = await vendorApi.listStores(vendorId);
      setStores(result.items);
      setListState("ready");
    } catch (caught) {
      setListState("error");
      setMessage(apiErrorMessage(caught, "CartNest could not load vendor stores."));
    }
  }, [access, canRead, vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <LoadingState label="Loading stores…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" onClick={() => void reload()}>Try again</button>} />;
  if (!canRead) return <ErrorState title="Store access restricted" message="Your vendor membership does not include permission to view stores." />;

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await vendorApi.createStore(vendorId, {
        name: name.trim(),
        slug: slug.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setStores((current) => [...current, created]);
      setName("");
      setSlug("");
      setDescription("");
      setSlugTouched(false);
      setMessage("Store created in DRAFT state.");
      setListState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not create this store."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Stores</p>
            <h1 className="pageTitle">Storefronts</h1>
            <p className="muted">A vendor may own multiple stores. SKU scope, products, orders and delivery configuration attach to a store.</p>
          </div>
          <VendorStatusPill status={access.vendor.status} />
        </div>

        {canCreate ? (
          <form className="panel sellerForm storeCreateForm" onSubmit={createStore}>
            <div className="sectionHeadingCompact">
              <div><h2>Create store</h2><p>New stores begin as DRAFT and cannot activate until the vendor is approved.</p></div>
            </div>
            <div className="formGrid formGridTwo">
              <label className="field">
                Store name
                <input
                  value={name}
                  onChange={(event) => {
                    const next = event.target.value;
                    setName(next);
                    if (!slugTouched) setSlug(slugify(next));
                  }}
                  minLength={2}
                  maxLength={160}
                  required
                />
              </label>
              <label className="field">
                Store slug
                <input
                  value={slug}
                  onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  minLength={2}
                  maxLength={120}
                  required
                />
                <span className="fieldHint">Lowercase letters, numbers and hyphens only.</span>
              </label>
            </div>
            <label className="field">
              Description <span className="fieldOptional">Optional</span>
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} />
            </label>
            {message ? <p className="formMessage" role="status">{message}</p> : null}
            <div><button className="primaryButton" disabled={busy}>{busy ? "Creating…" : "Create store"}</button></div>
          </form>
        ) : null}

        <section className="workspaceSection">
          <div className="sectionHeadingCompact"><div><h2>Your stores</h2><p>Open a store to update its details or lifecycle state.</p></div></div>
          {listState === "loading" ? <LoadingState label="Loading stores…" /> : null}
          {listState === "error" ? <ErrorState title="Stores unavailable" message={message ?? "CartNest could not load stores."} action={<button className="secondaryButton" onClick={() => void load()}>Try again</button>} /> : null}
          {listState === "ready" && stores.length === 0 ? <EmptyState title="No stores yet" message={canCreate ? "Create the first storefront for this vendor." : "No store is available to your membership."} /> : null}
          {listState === "ready" && stores.length > 0 ? (
            <div className="storeGrid">
              {stores.map((store) => (
                <article className="storeCard" key={store.id}>
                  <div className="sellerCardTopline"><VendorStatusPill status={store.status} /><span className="storeSlug">/{store.slug}</span></div>
                  <div><h3>{store.name}</h3><p>{store.description ?? "No store description yet."}</p></div>
                  <div className="actionRow"><Link className="secondaryButton" href={`/vendor/${encodeURIComponent(vendorId)}/stores/${encodeURIComponent(store.id)}`}>Manage store</Link></div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
