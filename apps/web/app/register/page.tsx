"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "../../components/session-provider";
import { API_BASE_URL, api, apiErrorMessage } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { reloadSession } = useSession();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await api.POST("/api/v1/auth/register", {
      body: { ...(email ? { email } : {}), ...(phone ? { phone } : {}), password },
    });
    setBusy(false);
    if (!result.data) {
      setMessage(apiErrorMessage(result.error, "Unable to create account."));
      return;
    }
    await reloadSession();
    router.push("/account");
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Join CartNest</p>
        <h1 className="authTitle">Create account</h1>
        <p className="muted">Use email, phone, or both. One verified identifier activates the account for protected marketplace actions.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+234…" /></label>
        <label>Password<input type="password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></label>
        {message ? <p className="formMessage" role="alert">{message}</p> : null}
        <button className="primaryButton" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <a className="secondaryButton" href={`${API_BASE_URL}/api/v1/auth/google/start`}>Continue with Google</a>
        <div className="formLinks"><Link href="/login">Already have an account?</Link></div>
      </form>
    </main>
  );
}
