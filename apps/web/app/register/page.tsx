"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "../../components/session-provider";
import { API_BASE_URL, api, apiErrorMessage } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { adoptSession } = useSession();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!email.trim() && !phone.trim()) {
      setMessage("Add an email address, a phone number, or both.");
      return;
    }

    setBusy(true);
    try {
      const result = await api.POST("/api/v1/auth/register", {
        body: {
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          password,
        },
      });
      if (!result.data) {
        setMessage(apiErrorMessage(result.error, "Unable to create account."));
        return;
      }
      adoptSession(result.data);
      router.replace(result.data.mfa.required && !result.data.mfa.satisfied ? "/mfa" : "/account");
    } catch {
      setMessage("CartNest could not reach the registration service. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <div className="authHeader"><p className="eyebrow">Join CartNest</p><h1 className="authTitle">Create account</h1><p className="muted">Start as a buyer. The same identity can later join or own vendor businesses without creating a second account.</p></div>
        <label className="field">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /><span className="fieldHint">Optional when a phone number is supplied.</span></label>
        <label className="field">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="+234…" /><span className="fieldHint">Use an international-format number where possible.</span></label>
        <label className="field">Password<input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /><span className="fieldHint">Use at least 12 characters. Backend password policy remains authoritative.</span></label>
        {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
        <button className="primaryButton" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        <div className="authDivider">or</div>
        <a className="secondaryButton" href={`${API_BASE_URL}/api/v1/auth/google/start`}>Continue with Google</a>
        <div className="formLinks"><Link href="/login">Already have an account?</Link></div>
      </form>
    </main>
  );
}
