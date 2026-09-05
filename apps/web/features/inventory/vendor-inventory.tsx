"use client";

import type { InventoryAdjustmentDto, InventoryItemDto, StoreDto } from "@repo/contracts";
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorCode, apiErrorMessage, inventoryApi, vendorApi } from "../../lib/api";
import { hasVendorPermission } from "../vendor/permissions";
import { useVendorAccess } from "../vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../vendor/vendor-workspace-shell";

function optionLabel(item: InventoryItemDto): string {
  if (item.optionValues.length === 0) return "Standard variant";
  return item.optionValues.map((value) => `${value.optionName}: ${value.value}`).join(" · ");
}

function InventoryRow({
  item,
  canAdjust,
  onUpdated,
}: Readonly<{
  item: InventoryItemDto;
  canAdjust: boolean;
  onUpdated: (item: InventoryItemDto) => void;
}>) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<readonly InventoryAdjustmentDto[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function loadHistory() {
    setHistoryError(null);
    try {
      setHistory((await inventoryApi.listAdjustments(item.variantId)).items);
    } catch (caught) {
      setHistoryError(apiErrorMessage(caught, "CartNest could not load the inventory history."));
    }
  }

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null) await loadHistory();
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDelta = Number(delta);
    const cleanReason = reason.trim();
    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
      setMessage("Enter a non-zero whole-number stock adjustment.");
      return;
    }
    if (cleanReason.length < 2) {
      setMessage("Add a reason for this auditable inventory adjustment.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const updated = await inventoryApi.adjustInventory(item.variantId, {
        delta: parsedDelta,
        reason: cleanReason,
        expectedVersion: item.version,
      });
      onUpdated(updated);
      setDelta("");
      setReason("");
      setMessage(`Inventory updated to ${updated.onHand} on hand.`);
      if (historyOpen) await loadHistory();
    } catch (caught) {
      if (apiErrorCode(caught) === "INVENTORY_VERSION_CONFLICT") {
        try {
          const current = await inventoryApi.getVariantInventory(item.variantId);
          onUpdated(current);
          setMessage("Inventory changed after this page loaded. Current values were refreshed; review them and retry your adjustment.");
        } catch {
          setMessage("Inventory changed after this page loaded. Reload the inventory table before retrying.");
        }
      } else {
        setMessage(apiErrorMessage(caught, "CartNest could not apply this inventory adjustment."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Fragment>
      <tr>
        <td>
          <strong>{item.productName}</strong>
          <p className="variantLabel">{optionLabel(item)}</p>
          <p className="variantLabel">SKU {item.sku}</p>
        </td>
        <td>
          <div className="inventoryNumbers">
            <span><small>On hand</small><strong>{item.onHand}</strong></span>
            <span><small>Reserved</small><strong>{item.reserved}</strong></span>
            <span><small>Available</small><strong>{item.available}</strong></span>
          </div>
          <p className="variantLabel">Version {item.version}</p>
        </td>
        <td>
          {canAdjust ? (
            <form className="inventoryAdjustmentForm" onSubmit={adjust}>
              <label className="field">Change<input aria-label={`Stock change for ${item.sku}`} type="number" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="+10 / -2" disabled={busy} required /></label>
              <label className="field">Reason<input aria-label={`Adjustment reason for ${item.sku}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} maxLength={300} placeholder="New stock received" disabled={busy} required /></label>
              <button className="primaryButton compactButton" disabled={busy}>{busy ? "Saving…" : "Adjust"}</button>
            </form>
          ) : <span className="commerceMeta">Read-only inventory access</span>}
          {message ? <p className={`variantLabel ${message.includes("changed after") ? "inventoryConflict" : ""}`} role="status">{message}</p> : null}
        </td>
        <td>
          <button className="secondaryButton compactButton" type="button" onClick={() => void toggleHistory()}>
            {historyOpen ? "Hide history" : "History"}
          </button>
        </td>
      </tr>
      {historyOpen ? (
        <tr>
          <td colSpan={4}>
            <div className="inventoryHistory">
              <h3>Adjustment history · {item.sku}</h3>
              {historyError ? <p className="formMessage formMessageError">{historyError}</p> : history === null ? <p className="variantLabel">Loading history…</p> : history.length === 0 ? <p className="variantLabel">No manual adjustments have been recorded for this variant.</p> : (
                <div className="inventoryHistoryList">
                  {history.map((entry) => (
                    <div className="inventoryHistoryItem" key={entry.id}>
                      <span className={entry.delta >= 0 ? "inventoryDeltaPositive" : "inventoryDeltaNegative"}>{entry.delta >= 0 ? `+${entry.delta}` : entry.delta}</span>
                      <div><strong>{entry.reason}</strong>{entry.referenceType || entry.referenceId ? <p className="variantLabel">{entry.referenceType ?? "Reference"}{entry.referenceId ? ` · ${entry.referenceId}` : ""}</p> : null}</div>
                      <time className="commerceMeta" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function VendorInventory({ vendorId }: Readonly<{ vendorId: string }>) {
  const { access, state: accessState, error: accessError, reload: reloadAccess } = useVendorAccess(vendorId);
  const [stores, setStores] = useState<readonly StoreDto[]>([]);
  const [storeId, setStoreId] = useState("");
  const [items, setItems] = useState<readonly InventoryItemDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const canRead = access ? hasVendorPermission(access, "inventory:read") : false;
  const canAdjust = access ? hasVendorPermission(access, "inventory:adjust") : false;

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
      setMessage(apiErrorMessage(caught, "CartNest could not load stores for inventory management."));
      setState("error");
    }
  }, [access, canRead, vendorId]);

  const loadInventory = useCallback(async () => {
    if (!storeId || !canRead) {
      setItems([]);
      if (canRead) setState("ready");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      setItems((await inventoryApi.listStoreInventory(storeId)).items);
      setState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load inventory for this store."));
      setState("error");
    }
  }, [canRead, storeId]);

  useEffect(() => { void loadStores(); }, [loadStores]);
  useEffect(() => { if (storeId) void loadInventory(); }, [loadInventory, storeId]);

  const selectedStore = useMemo(() => stores.find((store) => store.id === storeId) ?? null, [storeId, stores]);
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en");
    if (!term) return items;
    return items.filter((item) =>
      item.productName.toLocaleLowerCase("en").includes(term) ||
      item.sku.toLocaleLowerCase("en").includes(term) ||
      item.optionValues.some((value) => value.value.toLocaleLowerCase("en").includes(term)),
    );
  }, [items, search]);

  function replaceItem(updated: InventoryItemDto) {
    setItems((current) => current.map((item) => item.variantId === updated.variantId ? updated : item));
  }

  if (accessState === "loading") return <LoadingState label="Loading inventory workspace…" />;
  if (accessState === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={accessError ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" type="button" onClick={() => void reloadAccess()}>Try again</button>} />;
  if (!canRead) return <ErrorState title="Inventory access restricted" message="Your vendor membership does not include inventory:read or a capability that implies inventory read access." />;

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Operations</p>
            <h1 className="pageTitle">Inventory</h1>
            <p className="muted">Track on-hand, reserved, and available quantities per variant. Manual changes use optimistic version checks and leave an audit trail.</p>
          </div>
          {selectedStore ? <VendorStatusPill status={selectedStore.status} /> : null}
        </div>

        {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}

        {stores.length > 0 ? (
          <div className="panel compactPanel inventoryStoreSelector">
            <label className="field">Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.status}</option>)}</select></label>
          </div>
        ) : null}

        <section className="workspaceSection inventoryStack">
          {stores.length === 0 && state === "ready" ? <EmptyState title="No stores available" message="Inventory exists at the product-variant level, so a vendor store must exist before inventory can be managed." /> : null}
          {state === "loading" ? <LoadingState label="Loading variant inventory…" /> : null}
          {state === "error" ? <ErrorState title="Inventory unavailable" message={message ?? "CartNest could not load inventory."} action={<button className="secondaryButton" type="button" onClick={() => void loadInventory()}>Try again</button>} /> : null}
          {state === "ready" && stores.length > 0 ? (
            <div className="panel">
              <div className="inventoryHeader sectionHeadingCompact">
                <div><h2>{selectedStore?.name ?? "Store"} inventory</h2><p>{items.length} variant record{items.length === 1 ? "" : "s"}. Reserved stock cannot be removed by a manual adjustment.</p></div>
                <label className="field">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product, SKU, option" /></label>
              </div>
              {items.length === 0 ? <EmptyState title="No inventory variants" message="Create product variants first; CartNest creates inventory records on demand." /> : visibleItems.length === 0 ? <EmptyState title="No inventory matched" message="Clear or change the inventory search." /> : (
                <div className="inventoryTableWrap">
                  <table className="inventoryTable">
                    <thead><tr><th>Variant</th><th>Stock</th><th>{canAdjust ? "Adjustment" : "Access"}</th><th>Ledger</th></tr></thead>
                    <tbody>{visibleItems.map((item) => <InventoryRow key={item.variantId} item={item} canAdjust={canAdjust} onUpdated={replaceItem} />)}</tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
