"use client";

import type { StoreDto, VendorOrderListResponseDto, VendorOrderStatusDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, ordersApi, vendorApi } from "../../lib/api";
import { formatMoney } from "../catalog/catalog-utils";
import { hasVendorPermission } from "../vendor/permissions";
import { useVendorAccess } from "../vendor/use-vendor-access";
import { VendorWorkspaceShell } from "../vendor/vendor-workspace-shell";
import { VENDOR_ORDER_STATUSES, orderStatusClass, orderStatusLabel } from "./order-ui";

export function VendorOrdersPage({ vendorId }: Readonly<{ vendorId: string }>) {
  const { access, state: accessState, error: accessError, reload: reloadAccess } = useVendorAccess(vendorId);
  const [stores, setStores] = useState<readonly StoreDto[]>([]);
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState<"" | VendorOrderStatusDto>("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<VendorOrderListResponseDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const canRead = access ? hasVendorPermission(access, "order:read") : false;

  const loadStores = useCallback(async () => {
    if (!access || !canRead) return;
    setState("loading");
    setMessage(null);
    try {
      const response = await vendorApi.listStores(vendorId);
      setStores(response.items);
      setStoreId((current) => current && response.items.some((store) => store.id === current) ? current : (response.items[0]?.id ?? ""));
      if (response.items.length === 0) setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load stores for this order queue."));
      setState("error");
    }
  }, [access, canRead, vendorId]);

  const loadOrders = useCallback(async () => {
    if (!storeId || !canRead) {
      setResult(null);
      if (canRead) setState("ready");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      setResult(await ordersApi.listStoreOrders(storeId, { page, pageSize: 20, ...(status ? { status } : {}) }));
      setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load orders for this store."));
      setState("error");
    }
  }, [canRead, page, status, storeId]);

  useEffect(() => { void loadStores(); }, [loadStores]);
  useEffect(() => { if (storeId) void loadOrders(); }, [loadOrders, storeId]);

  const selectedStore = useMemo(() => stores.find((store) => store.id === storeId) ?? null, [storeId, stores]);

  function changeStore(next: string) {
    setStoreId(next);
    setPage(1);
  }

  function changeStatus(next: "" | VendorOrderStatusDto) {
    setStatus(next);
    setPage(1);
  }

  if (accessState === "loading") return <LoadingState label="Loading order workspace…" />;
  if (accessState === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={accessError ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" type="button" onClick={() => void reloadAccess()}>Try again</button>} />;
  if (!canRead) return <ErrorState title="Order access restricted" message="Your vendor membership does not include order:read or an order capability that implies read access." />;

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Operations</p>
            <h1 className="pageTitle">Orders</h1>
            <p className="muted">Each row is the store-specific slice of a buyer's parent CartNest order. Payment state is shown separately so fulfillment never starts from a browser assumption.</p>
          </div>
        </div>

        {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}

        {stores.length > 0 ? (
          <div className="panel compactPanel vendorOrderFilters">
            <label className="field">Store
              <select value={storeId} onChange={(event) => changeStore(event.target.value)}>
                {stores.map((store) => <option value={store.id} key={store.id}>{store.name} · {store.status}</option>)}
              </select>
            </label>
            <label className="field">Vendor-order status
              <select value={status} onChange={(event) => changeStatus(event.target.value as "" | VendorOrderStatusDto)}>
                <option value="">All statuses</option>
                {VENDOR_ORDER_STATUSES.map((item) => <option value={item} key={item}>{orderStatusLabel(item)}</option>)}
              </select>
            </label>
          </div>
        ) : null}

        <section className="workspaceSection">
          {stores.length === 0 && state === "ready" ? <EmptyState title="No stores available" message="A store must exist before it can receive vendor-order slices." /> : null}
          {state === "loading" ? <LoadingState label="Loading store orders…" /> : null}
          {state === "error" ? <ErrorState title="Order queue unavailable" message={message ?? "CartNest could not load the order queue."} action={<button className="secondaryButton" type="button" onClick={() => void loadOrders()}>Try again</button>} /> : null}
          {state === "ready" && selectedStore && result ? (
            result.items.length === 0 ? <EmptyState title="No vendor orders" message={status ? "No orders in this store match the selected status." : "This store has not received an order yet."} /> : (
              <>
                <div className="vendorOrderList">
                  {result.items.map((order) => (
                    <Link className="vendorOrderQueueCard" href={`/vendor/${encodeURIComponent(vendorId)}/orders/${encodeURIComponent(order.id)}`} key={order.id}>
                      <div className="vendorOrderQueueTop">
                        <div>
                          <span className="commerceMeta">Vendor order</span>
                          <strong>{order.id.slice(0, 8).toUpperCase()}</strong>
                        </div>
                        <div className="orderBadgeRow">
                          <span className={orderStatusClass(order.status)}>{orderStatusLabel(order.status)}</span>
                          <span className={orderStatusClass(order.paymentStatus)}>Payment: {orderStatusLabel(order.paymentStatus)}</span>
                        </div>
                      </div>
                      <div className="vendorOrderQueueBottom">
                        <div><span className="commerceMeta">Items</span><strong>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
                        <div><span className="commerceMeta">Total</span><strong>{formatMoney(order.total)}</strong></div>
                        <div><span className="commerceMeta">Created</span><strong>{new Date(order.createdAt).toLocaleString()}</strong></div>
                        <span className="orderOpenLabel">Open →</span>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="paginationRow">
                  <button className="secondaryButton compactButton" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                  <span className="commerceMeta">Page {result.pagination.page} of {Math.max(1, result.pagination.totalPages)} · {result.pagination.totalItems} order(s)</span>
                  <button className="secondaryButton compactButton" type="button" disabled={result.pagination.totalPages === 0 || page >= result.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
                </div>
              </>
            )
          ) : null}
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
