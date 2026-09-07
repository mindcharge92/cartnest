"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "../../components/session-provider";
import { API_BASE_URL, apiErrorMessage, authApi } from "../../lib/api";
import { safeReturnTo } from "../../lib/navigation";

export default function LoginPage() {
  const router = useRouter();
  const { adoptSession } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [returnTo, setReturnTo] = useState("/account");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReturnTo(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const session = await authApi.login({ identifier: identifier.trim(), password });
      adoptSession(session);
      router.replace(session.mfa.required && !session.mfa.satisfied ? "/mfa" : returnTo);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not reach the sign-in service. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <div className="authHeader"><p className="eyebrow">Welcome back</p><h1 className="authTitle">Sign in</h1><p className="muted">Use the email address or phone number attached to your CartNest account.</p></div>
        <label className="field">Email or phone<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" inputMode="email" required /></label>
        <label className="field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
        <button className="primaryButton" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="authDivider">or</div>
        <a className="secondaryButton" href={`${API_BASE_URL}/api/v1/auth/google/start`}>Continue with Google</a>
        <div className="formLinks"><Link href="/forgot-password">Forgot password?</Link><Link href="/register">Create account</Link></div>
      </form>
    </main>
  );
}
