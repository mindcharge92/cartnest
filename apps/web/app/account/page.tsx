"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "../../components/session-provider";
import { API_BASE_URL, api, apiErrorMessage } from "../../lib/api";

export default function AccountPage() {
  const { session, status, reloadSession } = useSession();
  const [message, setMessage] = useState<string | null>(null);

  if (status === "loading") return <main className="pageShell"><p>Loading session…</p></main>;
  if (!session) return <main className="pageShell"><div className="panel"><h1>Session expired</h1><p>Your session could not be renewed.</p><Link href="/login">Sign in again</Link></div></main>;

  async function requestVerification(channel: "email" | "phone") {
    const result = await api.POST("/api/v1/auth/verification/request", { body: { channel } });
    setMessage(result.data ? `Verification requested for ${channel}.` : apiErrorMessage(result.error, "Verification request failed."));
  }

  async function logoutAll() {
    const result = await api.POST("/api/v1/auth/logout-all", {});
    if (result.data) window.location.href = "/login";
    else setMessage(apiErrorMessage(result.error, "Could not revoke sessions."));
  }

  return (
    <main className="pageShell">
      <section className="panel">
        <p className="eyebrow">Authenticated account</p>
        <h1 className="pageTitle">Your CartNest identity</h1>
        <dl className="details">
          <div><dt>Email</dt><dd>{session.user.email ?? "Not added"} {session.user.emailVerified ? "✓ verified" : ""}</dd></div>
          <div><dt>Phone</dt><dd>{session.user.phone ?? "Not added"} {session.user.phoneVerified ? "✓ verified" : ""}</dd></div>
          <div><dt>Status</dt><dd>{session.user.status}</dd></div>
          <div><dt>Platform role</dt><dd>{session.user.platformRole}</dd></div>
          <div><dt>MFA</dt><dd>{session.mfa.required ? (session.mfa.satisfied ? "Satisfied" : session.mfa.enrolled ? "Challenge required" : "Enrollment required") : "Optional"}</dd></div>
        </dl>
        <div className="actionRow">
          {session.user.email && !session.user.emailVerified ? <button onClick={() => void requestVerification("email")}>Verify email</button> : null}
          {session.user.phone && !session.user.phoneVerified ? <button onClick={() => void requestVerification("phone")}>Verify phone</button> : null}
          <Link className="secondaryButton inlineButton" href="/mfa">MFA settings</Link>
          <a className="secondaryButton inlineButton" href={`${API_BASE_URL}/api/v1/auth/google/start?intent=link`}>Link Google</a>
          <button className="dangerButton" onClick={() => void logoutAll()}>Sign out everywhere</button>
          <button onClick={() => void reloadSession()}>Refresh session view</button>
        </div>
        {message ? <p className="formMessage" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
