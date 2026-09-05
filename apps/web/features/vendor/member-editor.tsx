"use client";

import type {
  UpdateVendorMemberBodyDto,
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

  const actorIsOwner = access.membership.role === "OWNER";
  const isSelf = member.user.id === access.membership.userId;
  const isPendingInvitation = member.status === "INVITED";
  const actorCanUpdate = hasVendorPermission(access, "staff:update") && !isSelf;
  const actorCanRemove =
    hasVendorPermission(access, "staff:remove") &&
    !isSelf &&
    (actorIsOwner || member.role !== "OWNER");
  const actorCanChangeRole = actorCanUpdate && actorIsOwner && !isPendingInvitation;
  const actorCanChangeStatus = actorCanUpdate && !isPendingInvitation && (actorIsOwner || member.role !== "OWNER");
  const actorCanDelegateCurrentSet =
    actorIsOwner || member.permissions.every((permission) => access.membership.permissions.includes(permission));
  const actorCanEditPermissions = actorCanUpdate && actorCanDelegateCurrentSet;

  useEffect(() => {
    setRole(member.role);
    setStatus(member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE");
    setPermissions(member.permissions);
  }, [member]);

  const identifier = useMemo(() => member.user.email ?? member.user.phone ?? member.user.id, [member]);

  function canDelegate(permission: VendorPermissionDto): boolean {
    return actorIsOwner || access.membership.permissions.includes(permission);
  }

  function togglePermission(permission: VendorPermissionDto) {
    if (!actorCanEditPermissions || !canDelegate(permission) || role === "OWNER") return;
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  function changeRole(nextRole: VendorMemberRoleDto) {
    if (!actorCanChangeRole) return;
    setRole(nextRole);
    if (member.role === "OWNER" && nextRole === "STAFF") {
      // Owner DTOs expose effective full access. Do not silently turn that into
      // explicit full STAFF access when an owner is demoted.
      setPermissions([]);
    }
  }

  async function save() {
    if (!actorCanUpdate) return;

    const body: UpdateVendorMemberBodyDto = {};
    if (actorCanEditPermissions) body.permissions = role === "OWNER" ? [] : [...permissions];
    if (!isPendingInvitation) {
      if (actorCanChangeStatus) body.status = status;
      if (actorCanChangeRole) body.role = role;
    }

    if (Object.keys(body).length === 0) {
      setMessage("There is no vendor access change you are allowed to submit for this member.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const updated = await vendorApi.updateMember(access.vendor.id, member.id, body);
      onSaved(updated);
      setMessage(isPendingInvitation ? "Invitation permissions updated." : "Staff access updated.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this staff member."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!actorCanRemove) return;
    if (!window.confirm(`Remove ${identifier} from ${access.vendor.displayName}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await vendorApi.removeMember(access.vendor.id, member.id);
      onRemoved(member.id);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not remove this staff member."));
    } finally {
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
        {isSelf ? (
          <p className="formMessage">Your own vendor membership cannot be changed from this screen. Another active vendor owner must make those changes.</p>
        ) : null}
        {isPendingInvitation ? (
          <p className="formMessage">This invitation is still pending. Permissions may be prepared, but the invited user must accept the invitation before the membership becomes ACTIVE. Role and status cannot be changed here.</p>
        ) : null}
        {!actorCanDelegateCurrentSet && !actorIsOwner ? (
          <p className="formMessage">This member currently holds permissions you cannot delegate. Only an owner or a staff member with a sufficient permission set can replace their permission list.</p>
        ) : null}

        <div className="formGrid formGridTwo">
          <label className="field">
            Role
            <select
              value={role}
              onChange={(event) => changeRole(event.target.value as VendorMemberRoleDto)}
              disabled={!actorCanChangeRole || busy}
            >
              <option value="STAFF">Staff</option>
              <option value="OWNER">Owner</option>
            </select>
            {!actorIsOwner ? <span className="fieldHint">Only a vendor owner can change membership roles.</span> : null}
          </label>
          <label className="field">
            Membership status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as Extract<VendorMemberStatusDto, "ACTIVE" | "SUSPENDED">)}
              disabled={!actorCanChangeStatus || busy}
            >
              {mutableStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="permissionGroups" aria-label={`Permissions for ${identifier}`}>
          {VENDOR_PERMISSION_GROUPS.map((group) => (
            <fieldset className="permissionGroup" key={group.label} disabled={!actorCanEditPermissions || busy || role === "OWNER"}>
              <legend>{group.label}</legend>
              {group.options.map((option) => {
                const delegatable = canDelegate(option.value);
                return (
                  <label className="permissionOption" key={option.value}>
                    <input
                      type="checkbox"
                      checked={role === "OWNER" || permissions.includes(option.value)}
                      disabled={!delegatable || !actorCanEditPermissions || busy || role === "OWNER"}
                      onChange={() => togglePermission(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}{!delegatable ? " You cannot delegate this permission." : ""}</small>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>

        {role === "OWNER" ? <p className="formMessage">Owners receive all vendor permissions. CartNest still protects the final active owner from unsafe removal or demotion.</p> : null}
        {message ? <p className="formMessage" role="status">{message}</p> : null}

        <div className="actionRow">
          {actorCanUpdate ? <button className="primaryButton" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : isPendingInvitation ? "Save invitation permissions" : "Save access"}</button> : null}
          {actorCanRemove ? <button className="dangerButton" type="button" disabled={busy} onClick={() => void remove()}>Remove member</button> : null}
        </div>
      </div>
    </details>
  );
}
