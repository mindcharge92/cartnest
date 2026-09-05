"use client";

import type { VendorMemberDto, VendorPermissionDto } from "@repo/contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthGuard } from "../../../../components/auth-guard";
import { EmptyState, ErrorState, LoadingState } from "../../../../components/page-state";
import { MemberEditor } from "../../../../features/vendor/member-editor";
import { hasVendorPermission, VENDOR_PERMISSION_GROUPS } from "../../../../features/vendor/permissions";
import { useVendorAccess } from "../../../../features/vendor/use-vendor-access";
import { VendorWorkspaceShell } from "../../../../features/vendor/vendor-workspace-shell";
import { apiErrorMessage, vendorApi } from "../../../../lib/api";

export default function VendorStaffPage() {
  return (
    <AuthGuard>
      <VendorStaff />
    </AuthGuard>
  );
}

function VendorStaff() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId ?? "";
  const { access, state, error, reload } = useVendorAccess(vendorId);
  const [members, setMembers] = useState<readonly VendorMemberDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [identifier, setIdentifier] = useState("");
  const [permissions, setPermissions] = useState<readonly VendorPermissionDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canRead = access ? hasVendorPermission(access, "staff:read") : false;
  const canInvite = access ? hasVendorPermission(access, "staff:invite") : false;

  const load = useCallback(async () => {
    if (!access || !canRead) return;
    setListState("loading");
    setMessage(null);
    try {
      const result = await vendorApi.listMembers(vendorId);
      setMembers(result.items);
      setListState("ready");
    } catch (caught) {
      setListState("error");
      setMessage(apiErrorMessage(caught, "CartNest could not load vendor staff."));
    }
  }, [access, canRead, vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <LoadingState label="Loading vendor staff…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" onClick={() => void reload()}>Try again</button>} />;
  if (!canRead) return <ErrorState title="Staff access restricted" message="Your vendor membership does not include permission to view staff." />;

  function togglePermission(permission: VendorPermissionDto) {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canInvite) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await vendorApi.inviteMember(vendorId, { identifier: identifier.trim(), permissions: [...permissions] });
      setMembers((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setIdentifier("");
      setPermissions([]);
      setMessage("Staff invitation created. The invited CartNest user must accept the vendor membership.");
      setListState("ready");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not create the staff invitation."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div>
            <p className="eyebrow">Staff & permissions</p>
            <h1 className="pageTitle">Vendor team</h1>
            <p className="muted">Owners have full access. Staff receive explicit permissions and backend authorization still validates every vendor/store resource.</p>
          </div>
        </div>

        {canInvite ? (
          <form className="panel sellerForm" onSubmit={invite}>
            <div className="sectionHeadingCompact"><div><h2>Invite staff member</h2><p>The user must already have a CartNest account matching the email or phone identifier.</p></div></div>
            <label className="field">Email or phone<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} minLength={3} maxLength={320} required /></label>
            <div className="permissionGroups">
              {VENDOR_PERMISSION_GROUPS.map((group) => (
                <fieldset className="permissionGroup" key={group.label} disabled={busy}>
                  <legend>{group.label}</legend>
                  {group.options.map((option) => (
                    <label className="permissionOption" key={option.value}>
                      <input type="checkbox" checked={permissions.includes(option.value)} onChange={() => togglePermission(option.value)} />
                      <span><strong>{option.label}</strong><small>{option.description}</small></span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {message ? <p className="formMessage" role="status">{message}</p> : null}
            <div><button className="primaryButton" disabled={busy}>{busy ? "Inviting…" : "Invite staff"}</button></div>
          </form>
        ) : null}

        <section className="workspaceSection">
          <div className="sectionHeadingCompact"><div><h2>Members</h2><p>Changes are subject to the backend's final-owner and membership-state safeguards.</p></div></div>
          {listState === "loading" ? <LoadingState label="Loading staff members…" /> : null}
          {listState === "error" ? <ErrorState title="Staff list unavailable" message={message ?? "CartNest could not load vendor members."} action={<button className="secondaryButton" onClick={() => void load()}>Try again</button>} /> : null}
          {listState === "ready" && members.length === 0 ? <EmptyState title="No vendor members" message="No active or invited vendor members were returned." /> : null}
          {listState === "ready" && members.length > 0 ? (
            <div className="memberList">
              {members.map((member) => (
                <MemberEditor
                  key={member.id}
                  access={access}
                  member={member}
                  onSaved={(updated) => setMembers((current) => current.map((item) => item.id === updated.id ? updated : item))}
                  onRemoved={(memberId) => setMembers((current) => current.filter((item) => item.id !== memberId))}
                />
              ))}
            </div>
          ) : null}
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
