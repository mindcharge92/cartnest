"use client";

import type { StoreDto, VendorProductDto } from "@repo/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "../../../../components/auth-guard";
import { EmptyState, ErrorState, LoadingState } from "../../../../components/page-state";
import { formatMoney } from "../../../../features/catalog/catalog-utils";
import { hasVendorPermission } from "../../../../features/vendor/permissions";
import { useVendorAccess } from "../../../../features/vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../../../../features/vendor/vendor-workspace-shell";
import { apiErrorMessage, catalogApi, vendorApi } from "../../../../lib/api";

function minimumPrice(product: VendorProductDto) {
  const active = product.variants.filter((variant) => variant.status === "ACTIVE");
  if (active.length === 0) return null;
  return active.reduce((lowest, variant) => BigInt(variant.price.amountMinor) < BigInt(lowest.price.amountMinor) ? variant : lowest).price;
}

export default function VendorProductsPage() {
  return <AuthGuard><VendorProducts /></AuthGuard>;
}

function VendorProducts() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId ?? "";
  const { access, state, error, reload } = useVendorAccess(vendorId);
  const [stores, setStores] = useState<readonly StoreDto[]>([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<readonly VendorProductDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const canReadStores = access ? hasVendorPermission(access, "store:read") : false;
  const canReadProducts = access ? hasVendorPermission(access, "product:read") : false;
  const canCreateProducts = access ? hasVendorPermission(access, "product:create") : false;

  const loadStores = useCallback(async () => {
    if (!access || !canReadStores) return;
    setListState("loading");
    setMessage(null);
    try {
      const response = await vendorApi.listStores(vendorId);
      setStores(response.items);
      setStoreId((current) => current || response.items[0]?.id || "");
      if (response.items.length === 0) setListState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load stores for product management."));
      setListState("error");
    }
  }, [access, canReadStores, vendorId]);

  const loadProducts = useCallback(async () => {
    if (!storeId || !canReadProducts) {
      setProducts([]);
      if (storeId) setListState("ready");
      return;
    }
    setListState("loading");
    setMessage(null);
    try {
      const response = await catalogApi.listStoreProducts(storeId);
      setProducts(response.items);
      setListState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load products for this store."));
      setListState("error");
    }
  }, [canReadProducts, storeId]);

  useEffect(() => { void loadStores(); }, [loadStores]);
  useEffect(() => { if (storeId) void loadProducts(); }, [loadProducts, storeId]);

  const selectedStore = useMemo(() => stores.find((store) => store.id === storeId) ?? null, [storeId, stores]);

  if (state === "loading") return <LoadingState label="Loading products workspace…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" onClick={() => void reload()}>Try again</button>} />;
  if (!canReadStores || !canReadProducts) {
    return <ErrorState title="Product access restricted" message="Product management requires both store:read and product:read so CartNest can safely resolve the store whose catalog you are viewing." />;
  }

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1 className="pageTitle">Products</h1>
            <p className="muted">Products belong to a store. Variants carry per-store SKUs and server-authoritative NGN prices.</p>
          </div>
          {canCreateProducts && selectedStore ? <Link className="primaryButton" href={`/vendor/${encodeURIComponent(vendorId)}/products/new?storeId=${encodeURIComponent(selectedStore.id)}`}>Create product</Link> : null}
        </div>

        {stores.length > 0 ? (
          <div className="panel compactPanel productStoreSelector">
            <label className="field">
              Store catalog
              <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.status}</option>)}
              </select>
            </label>
          </div>
        ) : null}

        <section className="workspaceSection">
          <div className="sectionHeadingCompact">
            <div><h2>{selectedStore ? `${selectedStore.name} products` : "Store products"}</h2><p>Draft, moderation and publication states are shown separately.</p></div>
          </div>
          {stores.length === 0 && listState === "ready" ? <EmptyState title="Create a store first" message="A product must belong to one of this vendor's stores before it can be created." action={<Link className="primaryButton" href={`/vendor/${encodeURIComponent(vendorId)}/stores`}>Go to stores</Link>} /> : null}
          {listState === "loading" ? <LoadingState label="Loading products…" /> : null}
          {listState === "error" ? <ErrorState title="Products unavailable" message={message ?? "CartNest could not load products."} action={<button className="secondaryButton" onClick={() => void loadProducts()}>Try again</button>} /> : null}
          {listState === "ready" && stores.length > 0 && products.length === 0 ? <EmptyState title="No products yet" message={canCreateProducts ? "Create the first product for this store." : "No product is available in this store."} /> : null}
          {listState === "ready" && products.length > 0 ? (
            <div className="vendorProductGrid">
              {products.map((product) => {
                const image = product.media.find((media) => media.status === "ACTIVE" && media.url);
                const price = minimumPrice(product);
                return (
                  <article className="vendorProductCard" key={product.id}>
                    <div className="vendorProductImage">{image?.url ? <img src={image.url} alt={image.altText ?? product.name} /> : <span className="catalogImageFallback">CN</span>}</div>
                    <div className="vendorProductBody">
                      <div className="sellerCardTopline"><VendorStatusPill status={product.status} /><VendorStatusPill status={product.moderationStatus} /></div>
                      <h3>{product.name}</h3>
                      <p>{product.category?.name ?? "Uncategorized"} · {product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</p>
                      <div className="vendorProductFooter"><strong>{price ? formatMoney(price) : "No active price"}</strong><Link className="secondaryButton" href={`/vendor/${encodeURIComponent(vendorId)}/products/${encodeURIComponent(product.id)}`}>Open product</Link></div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
