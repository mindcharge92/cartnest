"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "../../components/session-provider";
import { API_BASE_URL, api, apiErrorMessage } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { reloadSession } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await api.POST("/api/v1/auth/login", { body: { identifier, password } });
    setBusy(false);
    if (!result.data) {
      setMessage(apiErrorMessage(result.error, "Unable to sign in."));
      return;
    }
    await reloadSession();
    router.push(result.data.mfa.required && !result.data.mfa.satisfied ? "/mfa" : "/account");
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Welcome back</p>
        <h1 className="authTitle">Sign in</h1>
        <label>Email or phone<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {message ? <p className="formMessage" role="alert">{message}</p> : null}
        <button className="primaryButton" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <a className="secondaryButton" href={`${API_BASE_URL}/api/v1/auth/google/start`}>Continue with Google</a>
        <div className="formLinks"><Link href="/forgot-password">Forgot password?</Link><Link href="/register">Create account</Link></div>
      </form>
    </main>
  );
}
