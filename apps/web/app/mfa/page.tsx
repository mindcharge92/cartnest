"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "../../components/session-provider";
import { api, apiErrorMessage } from "../../lib/api";

export default function MfaPage() {
  const { session, status, reloadSession } = useSession();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (status === "loading") return <main className="pageShell"><p>Loading…</p></main>;
  if (!session) return <main className="pageShell"><p>Sign in to configure MFA. <Link href="/login">Sign in</Link></p></main>;

  async function begin() {
    const result = await api.POST("/api/v1/auth/mfa/totp/enroll", {});
    if (!result.data) return setMessage(apiErrorMessage(result.error, "Could not start MFA enrollment."));
    setSecret(result.data.secret);
    setUri(result.data.otpauthUri);
    setMessage("Add this secret to your authenticator app, then confirm a six-digit code.");
  }

  async function confirm() {
    const result = await api.POST("/api/v1/auth/mfa/totp/confirm", { body: { code } });
    if (!result.data) return setMessage(apiErrorMessage(result.error, "Enrollment confirmation failed."));
    setMessage("MFA enrolled. Submit a current code once more to satisfy this privileged session.");
    await reloadSession();
  }

  async function challenge() {
    const result = await api.POST("/api/v1/auth/mfa/challenge", { body: { code } });
    if (!result.data) return setMessage(apiErrorMessage(result.error, "MFA challenge failed."));
    setMessage("MFA verified for this privileged session.");
    await reloadSession();
  }

  return (
    <main className="pageShell">
      <section className="panel narrowPanel">
        <p className="eyebrow">Account security</p><h1 className="pageTitle">Authenticator MFA</h1>
        <p>Current state: {session.mfa.enrolled ? "enrolled" : "not enrolled"}; {session.mfa.satisfied ? "session verified" : "session not MFA-verified"}.</p>
        {!session.mfa.enrolled ? <button className="primaryButton" onClick={() => void begin()}>Start enrollment</button> : null}
        {secret ? <div className="secretBox"><strong>Secret</strong><code>{secret}</code>{uri ? <small>{uri}</small> : null}</div> : null}
        <label>Six-digit code<input inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <div className="actionRow">
          {!session.mfa.enrolled ? <button onClick={() => void confirm()}>Confirm enrollment</button> : null}
          {session.mfa.enrolled ? <button onClick={() => void challenge()}>Verify session</button> : null}
        </div>
        {message ? <p className="formMessage" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
