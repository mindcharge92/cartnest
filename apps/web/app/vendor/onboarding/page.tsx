"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthGuard } from "../../../components/auth-guard";
import { apiErrorMessage, vendorApi } from "../../../lib/api";
import { vendorWorkspacePath } from "../../../features/vendor/permissions";

export default function VendorOnboardingPage() {
  return (
    <AuthGuard>
      <VendorOnboarding />
    </AuthGuard>
  );
}

function VendorOnboarding() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const access = await vendorApi.createVendor({
        displayName: displayName.trim(),
        ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
        ...(registrationNumber.trim() ? { registrationNumber: registrationNumber.trim() } : {}),
      });
      router.push(vendorWorkspacePath(access.vendor.id));
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not create the vendor application."));
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <div className="sellerOnboardingGrid">
        <section>
          <p className="eyebrow">Vendor onboarding</p>
          <h1 className="pageTitle">Bring your business to CartNest</h1>
          <p className="sellerLead">Create the vendor account first. You can then add stores and submit the business and identity verification required before selling.</p>
          <ol className="sellerStepList">
            <li><strong>Business profile</strong><span>Create the vendor and ownership relationship.</span></li>
            <li><strong>Verification</strong><span>Submit BUSINESS and IDENTITY verification records for admin review.</span></li>
            <li><strong>Stores</strong><span>Prepare one or more storefronts while approval is pending.</span></li>
            <li><strong>Activation</strong><span>Stores can become active only after the vendor is approved.</span></li>
          </ol>
        </section>

        <form className="panel sellerForm" onSubmit={submit}>
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>Create vendor application</h2>
            <p className="muted">This application does not automatically grant selling approval.</p>
          </div>
          <label className="field">
            Business display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={160} required autoComplete="organization" />
            <span className="fieldHint">The marketplace-facing business name.</span>
          </label>
          <label className="field">
            Legal business name <span className="fieldOptional">Optional at this step</span>
            <input value={legalName} onChange={(event) => setLegalName(event.target.value)} maxLength={200} autoComplete="organization" />
          </label>
          <label className="field">
            Registration number <span className="fieldOptional">Optional at this step</span>
            <input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} maxLength={120} />
            <span className="fieldHint">If available, enter the business registration reference exactly as issued.</span>
          </label>
          {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
          <button className="primaryButton" disabled={busy}>{busy ? "Creating vendor…" : "Create vendor application"}</button>
        </form>
      </div>
    </main>
  );
}
