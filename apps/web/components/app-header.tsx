"use client";

import Link from "next/link";
import { useSession } from "./session-provider";

export function AppHeader() {
  const { session, status, logout } = useSession();
  const privileged = session?.user.platformRole === "ADMIN" || session?.user.platformRole === "SUPER_ADMIN";
  return (
    <header className="topbar">
      <Link className="brand" href="/">CartNest</Link>
      <nav className="nav" aria-label="Primary navigation">
        <Link href="/">Marketplace</Link>
        {status === "authenticated" ? (
          <>
            <Link href="/account">Account</Link>
            {privileged ? <Link href="/admin">Admin</Link> : null}
            {session?.mfa.required && !session.mfa.satisfied ? <Link href="/mfa">Verify MFA</Link> : null}
            <button className="linkButton" type="button" onClick={() => void logout()}>Sign out</button>
          </>
        ) : status === "unauthenticated" ? (
          <>
            <Link href="/login">Sign in</Link>
            <Link href="/register">Create account</Link>
          </>
        ) : null}
      </nav>
    </header>
  );
}
