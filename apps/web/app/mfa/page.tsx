"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGuard } from "../../components/auth-guard";
import { useSession } from "../../components/session-provider";
import { api, apiErrorMessage } from "../../lib/api";

function MfaPanel() {
  const { session, adoptSession, reloadSession } = useSession();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"begin" | "confirm" | "challenge" | null>(null);

  if (!session) return null;

  async function begin() {
    setBusy("begin"); setMessage(null); setError(null);
    try {
      const result = await api.POST("/api/v1/auth/mfa/totp/enroll", {});
      if (!result.data) return setError(apiErrorMessage(result.error, "Could not start MFA enrollment."));
      setSecret(result.data.secret);
      setUri(result.data.otpauthUri);
      setMessage("Add this secret to your authenticator app, then enter the current six-digit code.");
    } finally { setBusy(null); }
  }

  async function confirm() {
    setBusy("confirm"); setMessage(null); setError(null);
    try {
      const result = await api.POST("/api/v1/auth/mfa/totp/confirm", { body: { code } });
      if (!result.data) return setError(apiErrorMessage(result.error, "Enrollment confirmation failed."));
      setMessage("MFA is enrolled. Verify one current code to satisfy this privileged session.");
      await reloadSession();
    } finally { setBusy(null); }
  }

  async function challenge() {
    setBusy("challenge"); setMessage(null); setError(null);
    try {
      const result = await api.POST("/api/v1/auth/mfa/challenge", { body: { code } });
      if (!result.data) return setError(apiErrorMessage(result.error, "MFA challenge failed."));
      adoptSession(result.data);
      setMessage("MFA verified for this privileged session.");
    } finally { setBusy(null); }
  }

  return (
    <section className="panel narrowPanel">
      <p className="eyebrow">Account security</p>
      <h1 className="pageTitle">Authenticator MFA</h1>
      <p className="muted">Privileged CartNest roles require MFA. Other users may enroll it as an additional account control.</p>
      <dl className="details">
        <div><dt>Enrollment</dt><dd><span className={`statusPill ${session.mfa.enrolled ? "statusPillGood" : ""}`}>{session.mfa.enrolled ? "Enrolled" : "Not enrolled"}</span></dd></div>
        <div><dt>This session</dt><dd><span className={`statusPill ${session.mfa.satisfied ? "statusPillGood" : ""}`}>{session.mfa.satisfied ? "MFA verified" : "Not MFA verified"}</span></dd></div>
      </dl>
      {!session.mfa.enrolled ? <button className="primaryButton" type="button" disabled={busy !== null} onClick={() => void begin()}>{busy === "begin" ? "Starting…" : "Start enrollment"}</button> : null}
      {secret ? <div className="secretBox"><strong>Authenticator secret</strong><code>{secret}</code>{uri ? <small>{uri}</small> : null}<small>Keep this value private. Do not send it to support or another person.</small></div> : null}
      <label className="field">Six-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
      <div className="actionRow">
        {!session.mfa.enrolled ? <button className="secondaryButton" type="button" disabled={busy !== null || code.length !== 6} onClick={() => void confirm()}>{busy === "confirm" ? "Confirming…" : "Confirm enrollment"}</button> : null}
        {session.mfa.enrolled ? <button className="primaryButton" type="button" disabled={busy !== null || code.length !== 6} onClick={() => void challenge()}>{busy === "challenge" ? "Verifying…" : "Verify this session"}</button> : null}
        <Link className="secondaryButton" href="/account">Back to account</Link>
      </div>
      {message ? <p className="formMessage formMessageSuccess" role="status">{message}</p> : null}
      {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}
    </section>
  );
}

export default function MfaPage() {
  return <main className="pageShell"><AuthGuard><MfaPanel /></AuthGuard></main>;
}
