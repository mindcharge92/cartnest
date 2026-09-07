"use client";

import type { AuthSessionResponseDto } from "@repo/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiErrorMessage, apiErrorStatus, authApi } from "../lib/api";

type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface SessionContextValue {
  readonly session: AuthSessionResponseDto | null;
  readonly status: SessionStatus;
  readonly error: string | null;
  readonly reloadSession: () => Promise<void>;
  readonly adoptSession: (session: AuthSessionResponseDto) => void;
  readonly logout: () => Promise<void>;
  readonly logoutAll: () => Promise<boolean>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSession] = useState<AuthSessionResponseDto | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const adoptSession = useCallback((next: AuthSessionResponseDto) => {
    setSession(next);
    setError(null);
    setStatus("authenticated");
  }, []);

  const reloadSession = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const current = await authApi.getSession();
      adoptSession(current);
      return;
    } catch (caught) {
      if (apiErrorStatus(caught) !== 401) {
        setError(apiErrorMessage(caught, "CartNest could not verify your session right now."));
        setStatus("error");
        return;
      }
    }

    try {
      const refreshed = await authApi.refresh();
      adoptSession(refreshed);
    } catch (caught) {
      const statusCode = apiErrorStatus(caught);
      if (statusCode === 401 || statusCode === 403) {
        setSession(null);
        setError(null);
        setStatus("unauthenticated");
        return;
      }
      setError(apiErrorMessage(caught, "CartNest could not reach the session service."));
      setStatus("error");
    }
  }, [adoptSession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setSession(null);
      setError(null);
      setStatus("unauthenticated");
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
      setSession(null);
      setError(null);
      setStatus("unauthenticated");
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void reloadSession();
  }, [reloadSession]);

  const value = useMemo(
    () => ({ session, status, error, reloadSession, adoptSession, logout, logoutAll }),
    [session, status, error, reloadSession, adoptSession, logout, logoutAll],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
