"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGuard } from "../../components/auth-guard";
import { useSession } from "../../components/session-provider";
import { apiErrorMessage, authApi } from "../../lib/api";

type CopyTarget = "secret" | "uri" | null;

function SetupStep({
  number,
  title,
  children,
}: Readonly<{
  number: number;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <li className="mfaSetupStep">
      <span className="mfaStepNumber" aria-hidden="true">{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  );
}

function MfaPanel() {
  const { session, adoptSession, reloadSession } = useSession();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [busy, setBusy] = useState<"begin" | "confirm" | "challenge" | null>(null);

  if (!session) return null;

  async function copyValue(value: string, target: Exclude<CopyTarget, null>) {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Could not copy automatically. Press and hold the value to copy it manually.");
    }
  }

  async function begin() {
    setBusy("begin");
    setMessage(null);
    setError(null);
    setCode("");
    try {
      const enrollment = await authApi.beginTotpEnrollment();
      setSecret(enrollment.secret);
      setUri(enrollment.otpauthUri);
      setMessage("Setup key created. Add it to your authenticator app, then enter the current six-digit code.");
    } catch (caught) {
      setError(apiErrorMessage(caught, "Could not start MFA enrollment."));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("confirm");
    setMessage(null);
    setError(null);
    try {
      await authApi.confirmTotpEnrollment({ code });
      setSecret(null);
      setUri(null);
      setCode("");
      setMessage("MFA enrollment is complete. Enter a fresh code from your authenticator app to verify this session.");
      await reloadSession();
    } catch (caught) {
      setError(apiErrorMessage(caught, "Enrollment confirmation failed."));
    } finally {
      setBusy(null);
    }
  }

  async function challenge() {
    setBusy("challenge");
    setMessage(null);
    setError(null);
    try {
      const nextSession = await authApi.challengeTotp({ code });
      adoptSession(nextSession);
      setCode("");
      setMessage("This session is now MFA verified. You can continue to the admin dashboard.");
    } catch (caught) {
      setError(apiErrorMessage(caught, "MFA challenge failed."));
    } finally {
      setBusy(null);
    }
  }

  const setupStarted = Boolean(secret);
  const enrollmentReady = !session.mfa.enrolled && setupStarted;
  const fullyVerified = session.mfa.enrolled && session.mfa.satisfied;

  return (
    <section className="mfaWorkspace">
      <header className="mfaHeader">
        <div>
          <p className="eyebrow">Account security</p>
          <h1 className="pageTitle">Set up authenticator MFA</h1>
          <p className="muted mfaIntro">
            CartNest requires multi-factor authentication for privileged accounts.
            Use an authenticator app to protect admin access with a rotating six-digit code.
          </p>
        </div>
        <div className="mfaHeaderBadge" aria-label="MFA security requirement">
          <span className="mfaShieldMark" aria-hidden="true">✓</span>
          <div>
            <strong>Admin security</strong>
            <span>Required for privileged roles</span>
          </div>
        </div>
      </header>

      <div className="mfaStatusGrid">
        <article className="mfaStatusCard">
          <span className="mfaStatusLabel">Enrollment</span>
          <strong>{session.mfa.enrolled ? "Authenticator enrolled" : setupStarted ? "Setup in progress" : "Not enrolled"}</strong>
          <span className={`statusPill ${session.mfa.enrolled ? "statusPillGood" : ""}`}>
            {session.mfa.enrolled ? "Complete" : setupStarted ? "Awaiting code" : "Action required"}
          </span>
        </article>

        <article className="mfaStatusCard">
          <span className="mfaStatusLabel">Current session</span>
          <strong>{session.mfa.satisfied ? "Session verified" : "Verification pending"}</strong>
          <span className={`statusPill ${session.mfa.satisfied ? "statusPillGood" : ""}`}>
            {session.mfa.satisfied ? "Verified" : "Not verified"}
          </span>
        </article>
      </div>

      <div className="mfaContentGrid">
        <aside className="mfaGuideCard">
          <div className="mfaSectionHeading">
            <p className="eyebrow">Setup guide</p>
            <h2>What you need to do</h2>
            <p>Keep your authenticator app open while completing these steps.</p>
          </div>

          <ol className="mfaSetupSteps">
            <SetupStep number={1} title="Start enrollment">
              Generate a private setup key for your CartNest account.
            </SetupStep>
            <SetupStep number={2} title="Add CartNest to your authenticator">
              Open Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app. Choose “Enter setup key” and paste the key shown here.
            </SetupStep>
            <SetupStep number={3} title="Confirm enrollment">
              Your authenticator will show a six-digit code that changes every 30 seconds. Enter the current code below and confirm enrollment.
            </SetupStep>
            <SetupStep number={4} title="Verify this session">
              After enrollment succeeds, enter a fresh six-digit code once more. This unlocks privileged CartNest operations for this session.
            </SetupStep>
          </ol>

          <div className="mfaHelpBox">
            <strong>Before you continue</strong>
            <p>
              The setup key is sensitive. Do not send it to support or another person.
              Starting enrollment again replaces the previous key.
            </p>
          </div>
        </aside>

        <section className="mfaActionCard">
          <div className="mfaSectionHeading">
            <p className="eyebrow">{session.mfa.enrolled ? "Session verification" : "Authenticator setup"}</p>
            <h2>{session.mfa.enrolled ? "Verify your admin session" : "Connect your authenticator app"}</h2>
            <p>
              {session.mfa.enrolled
                ? "Your authenticator is enrolled. Enter the current code from the app to verify this session."
                : setupStarted
                  ? "Use the setup key below in your authenticator app, then enter the code it generates."
                  : "Start enrollment to generate a private setup key for your authenticator app."}
            </p>
          </div>

          {!session.mfa.enrolled ? (
            <button className="primaryButton mfaPrimaryAction" type="button" disabled={busy !== null} onClick={() => void begin()}>
              {busy === "begin" ? "Generating setup key…" : setupStarted ? "Generate a new setup key" : "Start enrollment"}
            </button>
          ) : null}

          {secret ? (
            <div className="mfaSecretPanel">
              <div className="mfaSecretTopline">
                <div>
                  <span className="mfaSecretLabel">Authenticator setup key</span>
                  <strong>Enter this key in your authenticator app</strong>
                </div>
                <button className="mfaCopyButton" type="button" onClick={() => void copyValue(secret, "secret")}>
                  {copied === "secret" ? "Copied" : "Copy key"}
                </button>
              </div>

              <code className="mfaSecretValue">{secret}</code>

              <div className="mfaSecretWarning">
                <span aria-hidden="true">!</span>
                <p>Keep this key private. Anyone with it can generate your MFA codes.</p>
              </div>

              {uri ? (
                <details className="mfaAdvancedSetup">
                  <summary>Advanced setup details</summary>
                  <p>If your authenticator supports an otpauth URI, you can use this instead of the setup key.</p>
                  <code>{uri}</code>
                  <button className="secondaryButton" type="button" onClick={() => void copyValue(uri, "uri")}>
                    {copied === "uri" ? "Copied" : "Copy setup link"}
                  </button>
                </details>
              ) : null}
            </div>
          ) : null}

          {!fullyVerified ? (
            <label className="field mfaCodeField">
              <span>{session.mfa.enrolled ? "Current authenticator code" : "Six-digit authenticator code"}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                aria-describedby="mfa-code-help"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <span className="fieldHint" id="mfa-code-help">
                Enter the current six-digit code shown in your authenticator app.
              </span>
            </label>
          ) : (
            <div className="mfaVerifiedCard">
              <span className="mfaVerifiedMark" aria-hidden="true">✓</span>
              <div>
                <strong>Session verified</strong>
                <p>Your admin session has satisfied MFA and is ready for privileged operations.</p>
              </div>
            </div>
          )}

          <div className="actionRow mfaActionRow">
            {enrollmentReady ? (
              <button className="primaryButton" type="button" disabled={busy !== null || code.length !== 6} onClick={() => void confirm()}>
                {busy === "confirm" ? "Confirming…" : "Confirm enrollment"}
              </button>
            ) : null}

            {session.mfa.enrolled && !session.mfa.satisfied ? (
              <button className="primaryButton" type="button" disabled={busy !== null || code.length !== 6} onClick={() => void challenge()}>
                {busy === "challenge" ? "Verifying…" : "Verify this session"}
              </button>
            ) : null}

            {fullyVerified ? <Link className="primaryButton" href="/admin">Continue to admin</Link> : null}
            <Link className="secondaryButton" href="/account">Back to account</Link>
          </div>

          {message ? <p className="formMessage formMessageSuccess" role="status">{message}</p> : null}
          {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}

export default function MfaPage() {
  return (
    <main className="pageShell mfaPageShell">
      <AuthGuard><MfaPanel /></AuthGuard>
    </main>
  );
}
