"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "../../components/session-provider";
import { apiErrorMessage, authApi } from "../../lib/api";

export default function VerifyPage() {
  const { session, reloadSession } = useSession();
  const [token, setToken] = useState("");
  const [tokenFromUrl, setTokenFromUrl] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token")
      ?? new URLSearchParams(window.location.search).get("token");
    if (value) {
      setToken(value);
      setTokenFromUrl(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await authApi.confirmVerification({ token: token.trim() });
      setMessage("Your identifier has been verified.");
      if (session) await reloadSession();
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not reach the verification service. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <div className="authHeader"><p className="eyebrow">Identity verification</p><h1 className="authTitle">Confirm your contact</h1><p className="muted">Confirm the single-use verification token sent through the selected channel.</p></div>
        {!tokenFromUrl ? <label className="field">Verification token<input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="one-time-code" required /></label> : null}
        {message ? <p className="formMessage formMessageSuccess" role="status">{message}</p> : null}
        {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}
        <button className="primaryButton" type="submit" disabled={busy || !token}>{busy ? "Confirming…" : "Confirm verification"}</button>
        <div className="formLinks">{session ? <Link href="/account">Back to account</Link> : <Link href="/login">Sign in</Link>}</div>
      </form>
    </main>
  );
}
