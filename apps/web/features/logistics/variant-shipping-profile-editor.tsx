"use client";

import type { VariantShippingProfileBodyDto } from "@repo/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiErrorCode, apiErrorMessage, logisticsApi } from "../../lib/api";

interface ShippingFormState {
  weightGrams: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  pieces: string;
}

const EMPTY: ShippingFormState = {
  weightGrams: "",
  lengthMm: "",
  widthMm: "",
  heightMm: "",
  pieces: "1",
};

function positiveInteger(value: string, required: boolean): number | undefined {
  const trimmed = value.trim();
  if (!trimmed && !required) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function VariantShippingProfileEditor({
  variantId,
  canUpdate,
}: Readonly<{
  variantId: string;
  canUpdate: boolean;
}>) {
  const [form, setForm] = useState<ShippingFormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const profile = await logisticsApi.getVariantShippingProfile(variantId);
      setForm({
        weightGrams: String(profile.weightGrams),
        lengthMm: profile.lengthMm === null ? "" : String(profile.lengthMm),
        widthMm: profile.widthMm === null ? "" : String(profile.widthMm),
        heightMm: profile.heightMm === null ? "" : String(profile.heightMm),
        pieces: String(profile.pieces),
      });
    } catch (caught) {
      if (apiErrorCode(caught) === "VARIANT_SHIPPING_PROFILE_NOT_FOUND") {
        setForm(EMPTY);
        setMessage("Shipping details required for GIGL quotes.");
      } else {
        setMessage(apiErrorMessage(caught, "Could not load shipping details."));
      }
    } finally {
      setLoading(false);
    }
  }, [variantId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!canUpdate) return;
    const weightGrams = positiveInteger(form.weightGrams, true);
    const pieces = positiveInteger(form.pieces, true);
    const lengthMm = positiveInteger(form.lengthMm, false);
    const widthMm = positiveInteger(form.widthMm, false);
    const heightMm = positiveInteger(form.heightMm, false);

    if (!weightGrams || !pieces) {
      setMessage("Weight and pieces must be positive whole numbers.");
      return;
    }
    if ((form.lengthMm && !lengthMm) || (form.widthMm && !widthMm) || (form.heightMm && !heightMm)) {
      setMessage("Dimensions must be positive whole millimetres when provided.");
      return;
    }

    const body: VariantShippingProfileBodyDto = {
      weightGrams,
      pieces,
      ...(lengthMm ? { lengthMm } : {}),
      ...(widthMm ? { widthMm } : {}),
      ...(heightMm ? { heightMm } : {}),
    };

    setBusy(true);
    setMessage(null);
    try {
      const profile = await logisticsApi.updateVariantShippingProfile(variantId, body);
      setForm({
        weightGrams: String(profile.weightGrams),
        lengthMm: profile.lengthMm === null ? "" : String(profile.lengthMm),
        widthMm: profile.widthMm === null ? "" : String(profile.widthMm),
        heightMm: profile.heightMm === null ? "" : String(profile.heightMm),
        pieces: String(profile.pieces),
      });
      setMessage("Shipping saved.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "Could not save shipping details."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <small className="tableMessage">Loading shipping…</small>;

  return (
    <div className="commerceStack">
      <label className="field">Weight (g)<input type="number" min={1} max={1000000} value={form.weightGrams} disabled={!canUpdate || busy} onChange={(event) => setForm((current) => ({ ...current, weightGrams: event.target.value }))} /></label>
      <div className="formGrid formGridTwo">
        <label className="field">Length mm<input type="number" min={1} value={form.lengthMm} disabled={!canUpdate || busy} onChange={(event) => setForm((current) => ({ ...current, lengthMm: event.target.value }))} /></label>
        <label className="field">Width mm<input type="number" min={1} value={form.widthMm} disabled={!canUpdate || busy} onChange={(event) => setForm((current) => ({ ...current, widthMm: event.target.value }))} /></label>
        <label className="field">Height mm<input type="number" min={1} value={form.heightMm} disabled={!canUpdate || busy} onChange={(event) => setForm((current) => ({ ...current, heightMm: event.target.value }))} /></label>
        <label className="field">Pieces<input type="number" min={1} max={1000} value={form.pieces} disabled={!canUpdate || busy} onChange={(event) => setForm((current) => ({ ...current, pieces: event.target.value }))} /></label>
      </div>
      {canUpdate ? <button className="secondaryButton compactButton" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save shipping"}</button> : null}
      {message ? <small className="tableMessage" role="status">{message}</small> : null}
    </div>
  );
}
