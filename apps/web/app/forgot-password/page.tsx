"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, apiErrorMessage } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await api.POST("/api/v1/auth/password-reset/request", { body: { identifier } });
    setMessage(result.data ? "If the account exists, password-reset instructions will be sent." : apiErrorMessage(result.error, "Request could not be processed."));
  }
  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Account recovery</p><h1 className="authTitle">Reset password</h1>
        <label>Email or phone<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></label>
        {message ? <p className="formMessage" role="status">{message}</p> : null}
        <button className="primaryButton">Request reset</button>
        <div className="formLinks"><Link href="/login">Back to sign in</Link></div>
      </form>
    </main>
  );
}
