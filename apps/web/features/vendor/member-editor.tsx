"use client";

import type {
  VendorAccessDto,
  VendorMemberDto,
  VendorMemberRoleDto,
  VendorMemberStatusDto,
  VendorPermissionDto,
} from "@repo/contracts";
import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage, vendorApi } from "../../lib/api";
import { hasVendorPermission, VENDOR_PERMISSION_GROUPS } from "./permissions";
import { VendorStatusPill } from "./vendor-workspace-shell";

const mutableStatuses: readonly Extract<VendorMemberStatusDto, "ACTIVE" | "SUSPENDED">[] = ["ACTIVE", "SUSPENDED"];

export function MemberEditor({
  access,
  member,
  onSaved,
  onRemoved,
}: Readonly<{
  access: VendorAccessDto;
  member: VendorMemberDto;
  onSaved: (member: VendorMemberDto) => void;
  onRemoved: (memberId: string) => void;
}>) {
  const [role, setRole] = useState<VendorMemberRoleDto>(member.role);
  const [status, setStatus] = useState<Extract<VendorMemberStatusDto, "ACTIVE" | "SUSPENDED">>(
    member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
  );
  const [permissions, setPermissions] = useState<readonly VendorPermissionDto[]>(member.permissions);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canUpdate = hasVendorPermission(access, "staff:update");
  const canRemove = hasVendorPermission(access, "staff:remove");
  const isSelf = member.user.id === access.membership.userId;

  useEffect(() => {
    setRole(member.role);
    setStatus(member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE");
    setPermissions(member.permissions);
  }, [member]);

  const identifier = useMemo(() => member.user.email ?? member.user.phone ?? member.user.id, [member]);

  function togglePermission(permission: VendorPermissionDto) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await vendorApi.updateMember(access.vendor.id, member.id, {
        role,
        status,
        permissions: [...permissions],
      });
      onSaved(updated);
      setMessage("Staff access updated.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this staff member."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${identifier} from ${access.vendor.displayName}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await vendorApi.removeMember(access.vendor.id, member.id);
      onRemoved(member.id);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not remove this staff member."));
      setBusy(false);
    }
  }

  return (
    <details className="memberCard">
      <summary className="memberSummary">
        <span>
          <strong>{identifier}</strong>
          <small>{member.role}{isSelf ? " · You" : ""}</small>
        </span>
        <VendorStatusPill status={member.status} />
      </summary>

      <div className="memberEditorBody">
        <div className="formGrid formGridTwo">
          <label className="field">
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as VendorMemberRoleDto)} disabled={!canUpdate || busy}>
              <option value="STAFF">Staff</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <label className="field">
            Membership status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as Extract<VendorMemberStatusDto, "ACTIVE" | "SUSPENDED">)}
              disabled={!canUpdate || busy}
            >
              {mutableStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="permissionGroups" aria-label={`Permissions for ${identifier}`}>
          {VENDOR_PERMISSION_GROUPS.map((group) => (
            <fieldset className="permissionGroup" key={group.label} disabled={!canUpdate || busy || role === "OWNER"}>
              <legend>{group.label}</legend>
              {group.options.map((option) => (
                <label className="permissionOption" key={option.value}>
                  <input
                    type="checkbox"
                    checked={role === "OWNER" || permissions.includes(option.value)}
                    onChange={() => togglePermission(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        {role === "OWNER" ? <p className="formMessage">Owners receive all vendor permissions. CartNest still protects the final active owner from unsafe removal or demotion.</p> : null}
        {message ? <p className="formMessage" role="status">{message}</p> : null}

        <div className="actionRow">
          {canUpdate ? <button className="primaryButton" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save access"}</button> : null}
          {canRemove ? <button className="dangerButton" type="button" disabled={busy || isSelf} onClick={() => void remove()}>Remove member</button> : null}
        </div>
      </div>
    </details>
  );
}
