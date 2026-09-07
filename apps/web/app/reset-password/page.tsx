"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { apiErrorMessage, authApi } from "../../lib/api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [tokenFromUrl, setTokenFromUrl] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    if (value) {
      setToken(value);
      setTokenFromUrl(true);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await authApi.confirmPasswordReset({ token: token.trim(), newPassword });
      setMessage("Password changed. Existing sessions have been revoked; sign in again.");
      setNewPassword("");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not reach the password-reset service. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <div className="authHeader"><p className="eyebrow">Account security</p><h1 className="authTitle">Choose a new password</h1><p className="muted">A successful reset revokes existing sessions as part of the account recovery flow.</p></div>
        {!tokenFromUrl ? <label className="field">Reset token<input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="one-time-code" required /></label> : null}
        <label className="field">New password<input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /><span className="fieldHint">Use at least 12 characters.</span></label>
        {message ? <p className="formMessage formMessageSuccess" role="status">{message}</p> : null}
        {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}
        <button className="primaryButton" type="submit" disabled={busy || !token}>{busy ? "Updating…" : "Update password"}</button>
        <div className="formLinks"><Link href="/login">Sign in</Link></div>
      </form>
    </main>
  );
}
