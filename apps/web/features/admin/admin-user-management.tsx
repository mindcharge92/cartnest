"use client";

import type {
  AdminUserSummaryDto,
  PaginationMetaDto,
  PlatformRoleDto,
} from "@repo/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { useSession } from "../../components/session-provider";
import { adminApi, apiErrorMessage } from "../../lib/api";

const roles: readonly PlatformRoleDto[] = ["USER", "ADMIN", "SUPER_ADMIN"];

function roleLabel(role: PlatformRoleDto): string {
  if (role === "SUPER_ADMIN") return "Super admin";
  if (role === "ADMIN") return "Admin";
  return "User";
}

function userIdentity(user: AdminUserSummaryDto): string {
  return user.email ?? user.phone ?? user.id;
}

function roleDescription(role: PlatformRoleDto): string {
  if (role === "SUPER_ADMIN") return "Full platform administration, including user-role management.";
  if (role === "ADMIN") return "Platform operations access after MFA, without role-management authority.";
  return "Standard customer/vendor account without platform administration access.";
}

export function AdminUserManagement() {
  const { session } = useSession();
  const currentUserId = session?.user.id ?? "";
  const [items, setItems] = useState<readonly AdminUserSummaryDto[]>([]);
  const [pagination, setPagination] = useState<PaginationMetaDto>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<PlatformRoleDto | "ALL">("ALL");
  const [draftRoles, setDraftRoles] = useState<Record<string, PlatformRoleDto>>({});
  const [pendingChange, setPendingChange] = useState<{
    user: AdminUserSummaryDto;
    role: PlatformRoleDto;
  } | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(search ? { search } : {}),
      ...(roleFilter !== "ALL" ? { role: roleFilter } : {}),
    }),
    [page, roleFilter, search],
  );

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await adminApi.listUsers(query);
      setItems(response.items);
      setPagination(response.pagination);
      setDraftRoles(
        Object.fromEntries(response.items.map((user) => [user.id, user.platformRole])),
      );
      setState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not load user administration."));
      setState("error");
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function changeRoleFilter(value: PlatformRoleDto | "ALL") {
    setPage(1);
    setRoleFilter(value);
  }

  function requestRoleChange(user: AdminUserSummaryDto) {
    const nextRole = draftRoles[user.id] ?? user.platformRole;
    if (nextRole === user.platformRole || user.id === currentUserId) return;
    setMessage(null);
    setError(null);
    setPendingChange({ user, role: nextRole });
  }

  async function confirmRoleChange() {
    if (!pendingChange) return;
    const { user, role } = pendingChange;
    setBusyUserId(user.id);
    setMessage(null);
    setError(null);

    try {
      const updated = await adminApi.setUserRole(user.id, role);
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setDraftRoles((current) => ({ ...current, [updated.id]: updated.platformRole }));
      setPendingChange(null);
      setMessage(
        `${userIdentity(updated)} is now ${roleLabel(updated.platformRole)}. Existing sessions for that account were revoked, so the user must sign in again.`,
      );
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not update that user's platform role."));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="commerceStack" aria-labelledby="admin-users-heading">
      <div className="sectionHeadingCompact adminUsersHeading">
        <div>
          <p className="eyebrow">Super admin</p>
          <h2 id="admin-users-heading">User access management</h2>
          <p>
            Promote or demote platform administrators. Role changes are audited and immediately
            revoke the affected user&apos;s active sessions.
          </p>
        </div>
        <button
          className="secondaryButton"
          type="button"
          disabled={state === "loading"}
          onClick={() => void load()}
        >
          {state === "loading" ? "Refreshing…" : "Refresh users"}
        </button>
      </div>

      <div className="adminUsersSecurityNote">
        <span className="adminUsersSecurityIcon" aria-hidden="true">!</span>
        <div>
          <strong>Protected SUPER_ADMIN operation</strong>
          <p>
            ADMIN accounts cannot change roles. CartNest also prevents changing your own role
            here and prevents removal of the final SUPER_ADMIN account.
          </p>
        </div>
      </div>

      <form className="adminUsersToolbar" onSubmit={applySearch}>
        <label className="field adminUsersSearch">
          Search users
          <div className="adminUsersSearchRow">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Email or phone"
              maxLength={160}
            />
            <button className="secondaryButton" type="submit">Search</button>
          </div>
        </label>

        <label className="field adminUsersFilter">
          Platform role
          <select
            value={roleFilter}
            onChange={(event) => changeRoleFilter(event.target.value as PlatformRoleDto | "ALL")}
          >
            <option value="ALL">All roles</option>
            <option value="USER">Users</option>
            <option value="ADMIN">Admins</option>
            <option value="SUPER_ADMIN">Super admins</option>
          </select>
        </label>
      </form>

      {search || roleFilter !== "ALL" ? (
        <div className="adminUsersActiveFilters">
          <span>
            Showing {pagination.totalItems} matching account{pagination.totalItems === 1 ? "" : "s"}.
          </span>
          <button
            className="adminUsersClearButton"
            type="button"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setRoleFilter("ALL");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {message ? <p className="formMessage formMessageSuccess" role="status">{message}</p> : null}
      {error ? <p className="formMessage formMessageError" role="alert">{error}</p> : null}

      {pendingChange ? (
        <div className="adminRoleConfirmation" role="alert">
          <div>
            <span className="eyebrow">Confirm role change</span>
            <h3>
              Change {userIdentity(pendingChange.user)} from{" "}
              {roleLabel(pendingChange.user.platformRole)} to {roleLabel(pendingChange.role)}?
            </h3>
            <p>
              {roleDescription(pendingChange.role)} The user&apos;s active sessions will be
              revoked immediately. Privileged roles must complete MFA before using admin tools.
            </p>
          </div>
          <div className="actionRow">
            <button
              className="primaryButton"
              type="button"
              disabled={busyUserId !== null}
              onClick={() => void confirmRoleChange()}
            >
              {busyUserId === pendingChange.user.id ? "Updating role…" : "Confirm change"}
            </button>
            <button
              className="secondaryButton"
              type="button"
              disabled={busyUserId !== null}
              onClick={() => {
                setDraftRoles((current) => ({
                  ...current,
                  [pendingChange.user.id]: pendingChange.user.platformRole,
                }));
                setPendingChange(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state === "loading" ? <LoadingState label="Loading CartNest users…" /> : null}
      {state === "error" ? (
        <ErrorState
          title="User administration unavailable"
          message={error ?? "CartNest could not load user administration."}
          action={
            <button className="secondaryButton" type="button" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      ) : null}

      {state === "ready" ? (
        <div className="adminUsersTableWrap">
          <table className="adminUsersTable">
            <thead>
              <tr>
                <th>User</th>
                <th>Account status</th>
                <th>Current role</th>
                <th>Change role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => {
                const isCurrentUser = user.id === currentUserId;
                const draftRole = draftRoles[user.id] ?? user.platformRole;
                const changed = draftRole !== user.platformRole;

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="adminUserIdentityCell">
                        <strong>{user.email ?? user.phone ?? "CartNest user"}</strong>
                        <span>{user.email && user.phone ? user.phone : user.id.slice(0, 8).toUpperCase()}</span>
                        {isCurrentUser ? <small>Current account</small> : null}
                      </div>
                    </td>
                    <td>
                      <span className={`statusPill ${user.status === "ACTIVE" ? "statusPillGood" : ""}`}>
                        {user.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      <span className={`adminRoleBadge adminRoleBadge${user.platformRole.replace("_", "")}`}>
                        {roleLabel(user.platformRole)}
                      </span>
                    </td>
                    <td>
                      <select
                        className="adminRoleSelect"
                        aria-label={`Role for ${userIdentity(user)}`}
                        value={draftRole}
                        disabled={isCurrentUser || busyUserId === user.id}
                        onChange={(event) =>
                          setDraftRoles((current) => ({
                            ...current,
                            [user.id]: event.target.value as PlatformRoleDto,
                          }))
                        }
                      >
                        {roles.map((role) => (
                          <option key={role} value={role}>{roleLabel(role)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className={changed ? "primaryButton adminRoleSaveButton" : "secondaryButton adminRoleSaveButton"}
                        type="button"
                        disabled={!changed || isCurrentUser || busyUserId !== null}
                        onClick={() => requestRoleChange(user)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {items.length === 0 ? (
            <div className="adminUsersEmpty">
              <strong>No users found</strong>
              <p>Try another search or clear the current role filter.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && pagination.totalPages > 1 ? (
        <div className="adminUsersPagination">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.totalItems} users
          </span>
          <div className="actionRow">
            <button
              className="secondaryButton"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              className="secondaryButton"
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
