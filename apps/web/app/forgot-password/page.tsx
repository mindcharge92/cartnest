"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, apiErrorMessage } from "../../lib/api";

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
      const result = await api.POST("/api/v1/auth/password-reset/request", { body: { identifier: identifier.trim() } });
      if (!result.data) {
        setError(apiErrorMessage(result.error, "Request could not be processed."));
        return;
      }
      setMessage("If the account exists, password-reset instructions will be sent.");
    } catch {
      setError("CartNest could not reach the recovery service. Try again.");
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
