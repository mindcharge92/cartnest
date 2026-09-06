"use client";

import type {
  FulfillmentProfileBodyDto,
  FulfillmentProfileDto,
  LogisticsStationDto,
} from "@repo/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiErrorCode, apiErrorMessage, logisticsApi } from "../../lib/api";

const EMPTY_PROFILE: FulfillmentProfileBodyDto = {
  defaultProvider: "MANUAL",
  manualDeliveryEnabled: true,
  manualDeliveryFeeAmountMinor: "0",
  currency: "NGN",
  originAddress: {
    recipientName: "",
    phone: "",
    line1: "",
    city: "",
    state: "",
    countryCode: "NG",
  },
  active: true,
};

function minorToNaira(value: string | undefined): string {
  if (!value) return "0.00";
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

function nairaToMinor(value: string): string | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  return (BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2))).toString();
}

function bodyFromProfile(profile: FulfillmentProfileDto): FulfillmentProfileBodyDto {
  return {
    defaultProvider: profile.defaultProvider,
    manualDeliveryEnabled: profile.manualDeliveryEnabled,
    ...(profile.manualDeliveryFee
      ? { manualDeliveryFeeAmountMinor: profile.manualDeliveryFee.amountMinor }
      : {}),
    currency: profile.manualDeliveryFee?.currency ?? "NGN",
    originAddress: profile.originAddress,
    ...(profile.giglStationId ? { giglStationId: profile.giglStationId } : {}),
    active: profile.active,
  };
}

export function FulfillmentProfileEditor({
  storeId,
  canUpdate,
}: Readonly<{
  storeId: string;
  canUpdate: boolean;
}>) {
  const [form, setForm] = useState<FulfillmentProfileBodyDto>(EMPTY_PROFILE);
  const [feeNaira, setFeeNaira] = useState("0.00");
  const [stations, setStations] = useState<readonly LogisticsStationDto[]>([]);
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setMessage(null);
    setSaved(false);
    try {
      const profile = await logisticsApi.getStoreFulfillmentProfile(storeId);
      const next = bodyFromProfile(profile);
      setForm(next);
      setFeeNaira(minorToNaira(next.manualDeliveryFeeAmountMinor));
    } catch (caught) {
      if (apiErrorCode(caught) === "FULFILLMENT_PROFILE_NOT_FOUND") {
        setForm(EMPTY_PROFILE);
        setFeeNaira("0.00");
        setMessage("No fulfillment profile exists yet. Configure one before buyers request delivery quotes.");
      } else {
        setMessage(apiErrorMessage(caught, "CartNest could not load this store's fulfillment profile."));
      }
    } finally {
      setState("ready");
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (form.defaultProvider !== "GIGL" || stations.length > 0) return;
    let cancelled = false;
    void logisticsApi.listStations()
      .then((response) => { if (!cancelled) setStations(response.items); })
      .catch(() => { /* Sender station can still be entered by ID when provider lookup is unavailable. */ });
    return () => { cancelled = true; };
  }, [form.defaultProvider, stations.length]);

  function setAddressField<K extends keyof FulfillmentProfileBodyDto["originAddress"]>(
    key: K,
    value: FulfillmentProfileBodyDto["originAddress"][K],
  ) {
    setForm((current) => ({
      ...current,
      originAddress: { ...current.originAddress, [key]: value },
    }));
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;

    const feeMinor = form.manualDeliveryEnabled ? nairaToMinor(feeNaira) : null;
    if (form.manualDeliveryEnabled && feeMinor === null) {
      setMessage("Enter a valid manual delivery fee in Naira with at most two decimal places.");
      setSaved(false);
      return;
    }
    if (form.defaultProvider === "MANUAL" && !form.manualDeliveryEnabled) {
      setMessage("Manual delivery must stay enabled while MANUAL is the default provider.");
      setSaved(false);
      return;
    }
    if (form.defaultProvider === "GIGL" && !form.giglStationId) {
      setMessage("Choose or enter the GIGL sender station for this store.");
      setSaved(false);
      return;
    }

    setBusy(true);
    setMessage(null);
    setSaved(false);
    try {
      const originAddress: FulfillmentProfileBodyDto["originAddress"] = {
        recipientName: form.originAddress.recipientName.trim(),
        phone: form.originAddress.phone.trim(),
        line1: form.originAddress.line1.trim(),
        ...(form.originAddress.line2?.trim() ? { line2: form.originAddress.line2.trim() } : {}),
        city: form.originAddress.city.trim(),
        state: form.originAddress.state.trim(),
        ...(form.originAddress.postalCode?.trim()
          ? { postalCode: form.originAddress.postalCode.trim() }
          : {}),
        countryCode: "NG",
      };
      const body: FulfillmentProfileBodyDto = {
        defaultProvider: form.defaultProvider,
        manualDeliveryEnabled: form.manualDeliveryEnabled,
        ...(form.manualDeliveryEnabled && feeMinor !== null
          ? { manualDeliveryFeeAmountMinor: feeMinor }
          : {}),
        currency: "NGN",
        originAddress,
        ...(form.defaultProvider === "GIGL" && form.giglStationId
          ? { giglStationId: form.giglStationId }
          : {}),
        active: form.active ?? true,
      };
      const updated = await logisticsApi.updateStoreFulfillmentProfile(storeId, body);
      const next = bodyFromProfile(updated);
      setForm(next);
      setFeeNaira(minorToNaira(next.manualDeliveryFeeAmountMinor));
      setMessage("Fulfillment settings saved. New delivery quotes will use this configuration.");
      setSaved(true);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not save this store's fulfillment settings."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel sellerForm" onSubmit={save}>
      <div className="sectionHeadingCompact">
        <div>
          <p className="eyebrow">FP8 fulfillment</p>
          <h2>Delivery configuration</h2>
          <p>Delivery prices are generated server-side from this store profile and snapshotted onto its VendorOrder at checkout.</p>
        </div>
        <span className="statusPill">{form.active ? "Active" : "Paused"}</span>
      </div>

      {state === "loading" ? <p className="formMessage">Loading fulfillment settings…</p> : null}

      <div className="formGrid formGridTwo">
        <label className="field">Default provider
          <select
            value={form.defaultProvider}
            disabled={!canUpdate || busy || state === "loading"}
            onChange={(event) => {
              const defaultProvider = event.target.value as FulfillmentProfileBodyDto["defaultProvider"];
              setForm((current) => ({
                ...current,
                defaultProvider,
                ...(defaultProvider === "MANUAL" ? { manualDeliveryEnabled: true } : {}),
              }));
              setSaved(false);
            }}
          >
            <option value="MANUAL">Vendor-managed / manual</option>
            <option value="GIGL">GIG Logistics</option>
          </select>
        </label>
        <label className="field">Profile state
          <select
            value={form.active === false ? "paused" : "active"}
            disabled={!canUpdate || busy || state === "loading"}
            onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === "active" }))}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span><input type="checkbox" checked={form.manualDeliveryEnabled} disabled={!canUpdate || busy || form.defaultProvider === "MANUAL"} onChange={(event) => setForm((current) => ({ ...current, manualDeliveryEnabled: event.target.checked }))} /> Enable vendor-managed delivery</span>
      </label>

      {form.manualDeliveryEnabled ? (
        <label className="field">Manual delivery fee (NGN)
          <input inputMode="decimal" value={feeNaira} disabled={!canUpdate || busy} onChange={(event) => { setFeeNaira(event.target.value); setSaved(false); }} placeholder="2500.00" required />
        </label>
      ) : null}

      {form.defaultProvider === "GIGL" ? (
        <label className="field">GIGL sender station ID
          <input
            type="number"
            min={1}
            list={`gigl-stations-${storeId}`}
            value={form.giglStationId ?? ""}
            disabled={!canUpdate || busy}
            onChange={(event) => {
              const value = event.target.value;
              setForm((current) => {
                const { giglStationId: _ignored, ...rest } = current;
                return value ? { ...rest, giglStationId: Number(value) } : rest;
              });
            }}
            required
          />
          <datalist id={`gigl-stations-${storeId}`}>
            {stations.map((station) => <option key={station.id} value={station.id}>{station.name}{station.state ? ` · ${station.state}` : ""}</option>)}
          </datalist>
          <span className="fieldHint">This is the sender/origin station. Buyer receiver stations are selected during checkout.</span>
        </label>
      ) : null}

      <div className="sectionHeadingCompact"><div><h3>Dispatch origin</h3><p>Used as the immutable origin snapshot sent into delivery quoting.</p></div></div>
      <div className="formGrid formGridTwo">
        <label className="field">Contact / sender name<input required minLength={2} maxLength={160} value={form.originAddress.recipientName} disabled={!canUpdate || busy} onChange={(event) => setAddressField("recipientName", event.target.value)} /></label>
        <label className="field">Phone<input required minLength={7} maxLength={32} value={form.originAddress.phone} disabled={!canUpdate || busy} onChange={(event) => setAddressField("phone", event.target.value)} /></label>
        <label className="field">Address line 1<input required minLength={2} maxLength={240} value={form.originAddress.line1} disabled={!canUpdate || busy} onChange={(event) => setAddressField("line1", event.target.value)} /></label>
        <label className="field">Address line 2<input maxLength={240} value={form.originAddress.line2 ?? ""} disabled={!canUpdate || busy} onChange={(event) => setAddressField("line2", event.target.value)} /></label>
        <label className="field">City<input required minLength={2} maxLength={120} value={form.originAddress.city} disabled={!canUpdate || busy} onChange={(event) => setAddressField("city", event.target.value)} /></label>
        <label className="field">State<input required minLength={2} maxLength={120} value={form.originAddress.state} disabled={!canUpdate || busy} onChange={(event) => setAddressField("state", event.target.value)} /></label>
        <label className="field">Postal code<input maxLength={32} value={form.originAddress.postalCode ?? ""} disabled={!canUpdate || busy} onChange={(event) => setAddressField("postalCode", event.target.value)} /></label>
        <label className="field">Country<input value="Nigeria (NG)" readOnly /></label>
      </div>

      {message ? <p className={saved ? "formMessage formMessageSuccess" : "formMessage"} role="status">{message}</p> : null}
      {canUpdate ? <div className="actionRow"><button className="primaryButton" disabled={busy || state === "loading"}>{busy ? "Saving…" : "Save fulfillment"}</button></div> : <p className="fieldHint">Your membership can view this profile but cannot change store settings.</p>}
    </form>
  );
}
