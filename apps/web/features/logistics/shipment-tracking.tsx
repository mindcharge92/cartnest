"use client";

import type {
  OrderDto,
  ShipmentDto,
  ShipmentStatusDto,
  VendorOrderDto,
} from "@repo/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiErrorMessage, logisticsApi } from "../../lib/api";
import { formatMoney } from "../catalog/catalog-utils";
import { orderStatusClass, orderStatusLabel } from "../orders/order-ui";

const MANUAL_NEXT: Readonly<Record<ShipmentStatusDto, readonly ShipmentStatusDto[]>> = {
  PENDING: ["BOOKED", "CANCELLED"],
  BOOKED: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNING"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNING"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "RETURNING"],
  FAILED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "RETURNING", "CANCELLED"],
  RETURNING: ["RETURNED"],
  RETURNED: [],
  DELIVERED: [],
  CANCELLED: [],
};

function itemNameMap(orderItems: ReadonlyArray<VendorOrderDto["items"][number]>): Map<string, string> {
  return new Map(orderItems.map((item) => [item.id, `${item.productName} · ${item.sku}`]));
}

function shipmentReference(shipment: ShipmentDto): string {
  return shipment.trackingNumber ?? shipment.providerShipmentReference ?? shipment.id.slice(0, 8).toUpperCase();
}

function ShipmentCard({
  shipment,
  itemNames,
  canUpdateManual = false,
  onUpdated,
}: Readonly<{
  shipment: ShipmentDto;
  itemNames: ReadonlyMap<string, string>;
  canUpdateManual?: boolean;
  onUpdated?: (shipment: ShipmentDto) => void | Promise<void>;
}>) {
  const [nextStatus, setNextStatus] = useState<ShipmentStatusDto | "">("");
  const [statusMessage, setStatusMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const transitions = shipment.provider === "MANUAL" ? MANUAL_NEXT[shipment.status] : [];

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextStatus || shipment.provider !== "MANUAL" || !canUpdateManual) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await logisticsApi.updateManualShipmentStatus(shipment.id, {
        status: nextStatus,
        ...(statusMessage.trim() ? { message: statusMessage.trim() } : {}),
      });
      setNextStatus("");
      setStatusMessage("");
      setMessage(`Shipment moved to ${orderStatusLabel(updated.status)}.`);
      await onUpdated?.(updated);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this shipment."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel">
      <div className="sectionHeadingCompact">
        <div>
          <p className="eyebrow">{shipment.provider === "GIGL" ? "GIG Logistics" : "Vendor-managed delivery"}</p>
          <h3>Shipment {shipmentReference(shipment)}</h3>
          <p>Created {new Date(shipment.createdAt).toLocaleString()}</p>
        </div>
        <span className={orderStatusClass(shipment.status)}>{orderStatusLabel(shipment.status)}</span>
      </div>

      <div className="orderItemList">
        {shipment.items.map((item) => (
          <div className="orderItemRow" key={item.orderItemId}>
            <div><strong>{itemNames.get(item.orderItemId) ?? "Order item"}</strong><span>Allocated quantity</span></div>
            <strong>{item.quantity}</strong>
          </div>
        ))}
      </div>

      {shipment.fee ? <p className="fieldHint">Shipment fee: {formatMoney(shipment.fee)}</p> : null}
      {shipment.deliveredAt ? <p className="formMessage formMessageSuccess">Delivered {new Date(shipment.deliveredAt).toLocaleString()}</p> : null}

      <div className="commerceStack" aria-label="Shipment history">
        <div className="sectionHeadingCompact"><div><h4>Tracking history</h4></div></div>
        {shipment.events.length === 0 ? <p className="formMessage">No tracking events have been recorded yet.</p> : shipment.events.map((event) => (
          <div className="orderItemRow" key={event.id}>
            <div>
              <strong>{orderStatusLabel(event.status)}</strong>
              <span>{new Date(event.eventTime).toLocaleString()}{event.location ? ` · ${event.location}` : ""}</span>
              {event.message ? <span>{event.message}</span> : null}
            </div>
          </div>
        ))}
      </div>

      {canUpdateManual && shipment.provider === "MANUAL" && transitions.length > 0 ? (
        <form className="commerceStack" onSubmit={updateStatus}>
          <div className="formGrid formGridTwo">
            <label className="field">Next status
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ShipmentStatusDto | "")} disabled={busy} required>
                <option value="">Choose status</option>
                {transitions.map((status) => <option key={status} value={status}>{orderStatusLabel(status)}</option>)}
              </select>
            </label>
            <label className="field">Tracking note <span className="fieldHint">Optional</span>
              <input maxLength={500} value={statusMessage} onChange={(event) => setStatusMessage(event.target.value)} disabled={busy} />
            </label>
          </div>
          <div className="actionRow"><button className="secondaryButton" disabled={busy || !nextStatus}>{busy ? "Updating…" : "Record shipment status"}</button></div>
        </form>
      ) : null}

      {shipment.provider === "GIGL" ? <p className="fieldHint">GIGL shipment state is provider-synchronized; vendor-entered status changes are intentionally disabled.</p> : null}
      {message ? <p className="formMessage" role="status">{message}</p> : null}
    </article>
  );
}

export function BuyerShipmentTracking({ order }: Readonly<{ order: OrderDto }>) {
  const [shipments, setShipments] = useState<readonly ShipmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await logisticsApi.listBuyerOrderShipments(order.id);
      setShipments(response.items);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not load shipment tracking for this order."));
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => { void load(); }, [load]);

  const names = useMemo(
    () => itemNameMap(order.vendorOrders.flatMap((vendorOrder) => vendorOrder.items)),
    [order.vendorOrders],
  );

  return (
    <section className="commerceStack" aria-labelledby="buyer-shipment-heading">
      <div className="sectionHeadingCompact">
        <div><p className="eyebrow">FP8 tracking</p><h2 id="buyer-shipment-heading">Shipments & delivery</h2><p>Each store may dispatch one or more shipments. Tracking is derived from backend shipment events.</p></div>
        <button className="secondaryButton" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh tracking"}</button>
      </div>
      {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
      {loading && shipments.length === 0 ? <p className="formMessage">Loading shipment tracking…</p> : null}
      {!loading && shipments.length === 0 && !message ? <p className="formMessage">No shipment has been created yet. Tracking will appear here after the store begins fulfillment.</p> : null}
      {shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} itemNames={names} />)}
    </section>
  );
}

export function VendorShipmentManager({
  order,
  canFulfill,
  onOrderChanged,
}: Readonly<{
  order: VendorOrderDto;
  canFulfill: boolean;
  onOrderChanged: () => void | Promise<void>;
}>) {
  const [shipments, setShipments] = useState<readonly ShipmentDto[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [trackingNumber, setTrackingNumber] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadFailed(false);
    setMessage(null);
    setSuccess(false);
    try {
      const response = await logisticsApi.listVendorOrderShipments(order.id);
      setShipments(response.items);
      return true;
    } catch (caught) {
      setLoadFailed(true);
      setMessage(apiErrorMessage(caught, "CartNest could not load shipments for this vendor order."));
      return false;
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => { void load(); }, [load]);

  const names = useMemo(() => itemNameMap(order.items), [order.items]);
  const remaining = useMemo(() => {
    const allocated = new Map<string, number>();
    for (const shipment of shipments) {
      if (shipment.status === "CANCELLED") continue;
      for (const item of shipment.items) {
        allocated.set(item.orderItemId, (allocated.get(item.orderItemId) ?? 0) + item.quantity);
      }
    }
    return new Map(order.items.map((item) => [item.id, Math.max(0, item.quantity - (allocated.get(item.id) ?? 0))]));
  }, [order.items, shipments]);
  const unitsRemaining = [...remaining.values()].reduce((sum, quantity) => sum + quantity, 0);
  const orderCanShip = order.paymentStatus === "SUCCEEDED" && !["CANCELLED", "REFUNDED"].includes(order.status);
  const canCreateShipment = canFulfill && orderCanShip && unitsRemaining > 0 && !loading && !loadFailed;

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateShipment) return;

    const items: Array<{ orderItemId: string; quantity: number }> = [];
    for (const item of order.items) {
      const raw = quantities[item.id]?.trim() ?? "";
      if (!raw) continue;
      const quantity = Number(raw);
      const available = remaining.get(item.id) ?? 0;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) {
        setMessage(`Enter a whole shipment quantity between 1 and ${available} for ${item.productName}.`);
        setSuccess(false);
        return;
      }
      items.push({ orderItemId: item.id, quantity });
    }
    if (items.length === 0) {
      setMessage("Enter at least one shipment quantity.");
      setSuccess(false);
      return;
    }

    setBusy(true);
    setMessage(null);
    setSuccess(false);
    try {
      await logisticsApi.createShipment(order.id, {
        provider: "MANUAL",
        items,
        ...(trackingNumber.trim() ? { trackingNumber: trackingNumber.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setQuantities({});
      setTrackingNumber("");
      setNote("");
      const refreshed = await load();
      await onOrderChanged();
      if (refreshed) {
        setMessage("Shipment created. Allocated quantities are now reserved against this vendor order.");
        setSuccess(true);
      }
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not create this shipment."));
    } finally {
      setBusy(false);
    }
  }

  async function shipmentUpdated() {
    await load();
    await onOrderChanged();
  }

  return (
    <section className="commerceStack" aria-labelledby="vendor-shipment-heading">
      <div className="sectionHeadingCompact">
        <div><p className="eyebrow">FP8 fulfillment</p><h2 id="vendor-shipment-heading">Shipments</h2><p>Split a paid VendorOrder across multiple physical shipments without exceeding each ordered quantity.</p></div>
        <button className="secondaryButton" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      {message ? <p className={success ? "formMessage formMessageSuccess" : "formMessage formMessageError"} role="status">{message}</p> : null}
      {loadFailed ? <p className="fieldHint">Shipment mutations are disabled until the authoritative shipment list can be loaded.</p> : null}

      {canCreateShipment ? (
        <form className="panel sellerForm" onSubmit={createShipment}>
          <div className="sectionHeadingCompact"><div><h3>Create manual shipment</h3><p>GIGL live booking remains intentionally gated until its contracted sandbox payload is verified. Manual/self-delivery stays fully usable.</p></div><span className="statusPill">{unitsRemaining} unit(s) remaining</span></div>
          <div className="orderItemList">
            {order.items.map((item) => {
              const available = remaining.get(item.id) ?? 0;
              return (
                <label className="orderItemRow" key={item.id}>
                  <div><strong>{item.productName}</strong><span>{item.sku} · {available} of {item.quantity} remaining</span></div>
                  <input aria-label={`Quantity to ship for ${item.productName}`} type="number" min={available > 0 ? 1 : 0} max={available} value={quantities[item.id] ?? ""} disabled={busy || available === 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={available > 0 ? "0" : "Done"} />
                </label>
              );
            })}
          </div>
          <div className="formGrid formGridTwo">
            <label className="field">Tracking number <span className="fieldHint">Optional</span><input minLength={2} maxLength={160} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} disabled={busy} /></label>
            <label className="field">Dispatch note <span className="fieldHint">Optional</span><input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></label>
          </div>
          <div className="actionRow"><button className="primaryButton" disabled={busy}>{busy ? "Creating…" : "Create shipment"}</button></div>
          <p className="fieldHint">The backend independently verifies payment, ownership and cumulative allocation. Browser quantities are never trusted as fulfillment authority.</p>
        </form>
      ) : null}

      {!canFulfill ? <p className="formMessage">Your membership can view shipment tracking but does not include order:fulfill.</p> : null}
      {canFulfill && !loadFailed && order.paymentStatus !== "SUCCEEDED" ? <p className="formMessage">Shipment creation unlocks only after the parent payment is verified as successful.</p> : null}
      {canFulfill && !loadFailed && order.paymentStatus === "SUCCEEDED" && ["CANCELLED", "REFUNDED"].includes(order.status) ? <p className="formMessage">This cancelled or refunded vendor order cannot be fulfilled.</p> : null}
      {canFulfill && !loadFailed && orderCanShip && unitsRemaining === 0 && order.items.length > 0 ? <p className="formMessage formMessageSuccess">All ordered units are allocated to active shipments.</p> : null}
      {loading && shipments.length === 0 ? <p className="formMessage">Loading shipments…</p> : null}
      {!loading && !loadFailed && shipments.length === 0 ? <p className="formMessage">No shipment has been created for this store order yet.</p> : null}
      {shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} itemNames={names} canUpdateManual={canFulfill && !loadFailed} onUpdated={shipmentUpdated} />)}
    </section>
  );
}
