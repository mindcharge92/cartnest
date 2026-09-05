"use client";

import type { VendorAccessDto } from "@repo/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, vendorApi } from "../../lib/api";

export type VendorAccessLoadState = "loading" | "ready" | "error";

export function useVendorAccess(vendorId: string) {
  const [access, setAccess] = useState<VendorAccessDto | null>(null);
  const [state, setState] = useState<VendorAccessLoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!vendorId) {
      setState("error");
      setError("The vendor identifier is missing.");
      return;
    }

    setState("loading");
    setError(null);
    try {
      const next = await vendorApi.get(vendorId);
      setAccess(next);
      setState("ready");
    } catch (caught) {
      setAccess(null);
      setState("error");
      setError(apiErrorMessage(caught, "CartNest could not load this vendor workspace."));
    }
  }, [vendorId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { access, state, error, reload, setAccess } as const;
}
