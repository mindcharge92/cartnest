"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, apiErrorMessage } from "../../lib/api";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await api.POST("/api/v1/auth/password-reset/confirm", { body: { token, newPassword } });
    setMessage(result.data ? "Password changed. Sign in again on all devices." : apiErrorMessage(result.error, "Reset failed."));
  }
  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Security</p><h1 className="authTitle">Choose a new password</h1>
        <label>Reset token<input value={token} onChange={(e) => setToken(e.target.value)} required /></label>
        <label>New password<input type="password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
        {message ? <p className="formMessage" role="status">{message}</p> : null}
        <button className="primaryButton">Update password</button>
        <div className="formLinks"><Link href="/login">Sign in</Link></div>
      </form>
    </main>
  );
}
