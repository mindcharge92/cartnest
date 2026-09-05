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
import { api } from "../lib/api";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionContextValue {
  readonly session: AuthSessionResponseDto | null;
  readonly status: SessionStatus;
  readonly reloadSession: () => Promise<void>;
  readonly logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSession] = useState<AuthSessionResponseDto | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const reloadSession = useCallback(async () => {
    setStatus("loading");
    const first = await api.GET("/api/v1/auth/session");
    if (first.data) {
      setSession(first.data);
      setStatus("authenticated");
      return;
    }
    if (first.response.status === 401) {
      const refreshed = await api.POST("/api/v1/auth/refresh", {});
      if (refreshed.data) {
        setSession(refreshed.data);
        setStatus("authenticated");
        return;
      }
    }
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const logout = useCallback(async () => {
    await api.POST("/api/v1/auth/logout", {});
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    void reloadSession();
  }, [reloadSession]);

  const value = useMemo(() => ({ session, status, reloadSession, logout }), [session, status, reloadSession, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
