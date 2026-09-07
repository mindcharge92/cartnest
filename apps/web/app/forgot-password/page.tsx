"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiErrorMessage, authApi } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await authApi.requestPasswordReset({ identifier: identifier.trim() });
      setMessage("If the account exists, password-reset instructions will be sent.");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not reach the recovery service. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <div className="authHeader"><p className="eyebrow">Account recovery</p><h1 className="authTitle">Reset password</h1><p className="muted">Enter the email address or phone number attached to your account.</p></div>
        <label className="field">Email or phone<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /></label>
        {message ? <p className="formMessage formMessageSuccess" role="status">{message}</p> : null}
        {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}
        <button className="primaryButton" type="submit" disabled={busy}>{busy ? "Requesting…" : "Request reset"}</button>
        <div className="formLinks"><Link href="/login">Back to sign in</Link></div>
      </form>
    </main>
  );
}
