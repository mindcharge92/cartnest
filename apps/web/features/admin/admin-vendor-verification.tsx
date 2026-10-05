"use client";

import type {
  VendorDto,
  VendorStatusDto,
  VendorVerificationDto,
  VendorVerificationStatusDto,
  VendorVerificationTypeDto,
} from "@repo/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import {
  effectiveVerificationStatus,
  isCurrentVerified,
  latestVerification,
} from "../vendor/verification";
import { apiErrorMessage, vendorApi } from "../../lib/api";
import { AdminVendorSettlement } from "./admin-vendor-settlement";

const vendorStatuses: readonly VendorStatusDto[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
const requiredTypes: readonly VendorVerificationTypeDto[] = ["BUSINESS", "IDENTITY"];

type ReviewDialog =
  | { kind: "reject-verification"; verification: VendorVerificationDto }
  | { kind: "reject-vendor"; vendor: VendorDto }
  | { kind: "suspend-vendor"; vendor: VendorDto };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusClass(status: VendorStatusDto | VendorVerificationStatusDto): string {
  if (status === "APPROVED" || status === "VERIFIED") return "statusPill statusPillGood";
  if (status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED")
    return "statusPill adminKycStatusDanger";
  return "statusPill adminKycStatusPending";
}

export function AdminVendorVerification() {
  const [filter, setFilter] = useState<VendorStatusDto | "ALL">("PENDING");
  const [vendors, setVendors] = useState<readonly VendorDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<readonly VendorVerificationDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [verificationState, setVerificationState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ReviewDialog | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === selectedId) ?? null,
    [selectedId, vendors],
  );

  const loadVendors = useCallback(async () => {
    setListState("loading");
    setError(null);
    try {
      const response = await vendorApi.adminList(filter === "ALL" ? undefined : filter);
      setVendors(response.items);
      setSelectedId((current) =>
        current && response.items.some((vendor) => vendor.id === current)
          ? current
          : (response.items[0]?.id ?? null),
      );
      setListState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not load the vendor review queue."));
      setListState("error");
    }
  }, [filter]);

  const loadVerifications = useCallback(async (vendorId: string) => {
    setVerificationState("loading");
    setError(null);
    try {
      const response = await vendorApi.adminListVerifications(vendorId);
      setVerifications(response.items);
      setVerificationState("ready");
    } catch (caught) {
      setVerifications([]);
      setError(
        apiErrorMessage(caught, "CartNest could not load this vendor's verification records."),
      );
      setVerificationState("error");
    }
  }, []);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    if (selectedId) void loadVerifications(selectedId);
    else {
      setVerifications([]);
      setVerificationState("idle");
    }
  }, [loadVerifications, selectedId]);

  const business = latestVerification(verifications, "BUSINESS");
  const identity = latestVerification(verifications, "IDENTITY");
  const bankAccount = latestVerification(verifications, "BANK_ACCOUNT");
  const approvalReady = isCurrentVerified(business) && isCurrentVerified(identity);
  const bankVerificationReady = isCurrentVerified(bankAccount);
  const requiredCompleted = requiredTypes.filter((type) =>
    isCurrentVerified(latestVerification(verifications, type)),
  ).length;

  async function refreshAfterAction(vendorId: string, refreshVerifications = false) {
    if (refreshVerifications) {
      await Promise.all([loadVendors(), loadVerifications(vendorId)]);
      return;
    }
    await loadVendors();
  }

  async function verifyRecord(item: VendorVerificationDto) {
    setBusy(`verification:${item.id}`);
    setMessage(null);
    setError(null);
    try {
      await vendorApi.adminReviewVerification(item.id, { status: "VERIFIED" });
      setMessage(`${item.type.replaceAll("_", " ")} verification marked VERIFIED.`);
      await refreshAfterAction(item.vendorId, true);
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not verify that record."));
    } finally {
      setBusy(null);
    }
  }

  async function approveVendor(vendor: VendorDto) {
    setBusy(`vendor:${vendor.id}`);
    setMessage(null);
    setError(null);
    try {
      await vendorApi.adminApprove(vendor.id);
      setMessage(`${vendor.displayName} has been approved to operate on CartNest.`);
      await refreshAfterAction(vendor.id);
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not approve this vendor."));
    } finally {
      setBusy(null);
    }
  }

  function openDialog(next: ReviewDialog) {
    setReason("");
    setError(null);
    setMessage(null);
    setDialog(next);
  }

  async function submitReasonedAction() {
    if (!dialog) return;
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      setError("Enter a clear reason before continuing.");
      return;
    }

    const vendorId =
      dialog.kind === "reject-verification" ? dialog.verification.vendorId : dialog.vendor.id;
    const key =
      dialog.kind === "reject-verification"
        ? `verification:${dialog.verification.id}`
        : `vendor:${dialog.vendor.id}`;
    setBusy(key);
    setError(null);
    setMessage(null);

    try {
      if (dialog.kind === "reject-verification") {
        await vendorApi.adminReviewVerification(dialog.verification.id, {
          status: "REJECTED",
          reason: trimmed,
        });
        setMessage(`${dialog.verification.type.replaceAll("_", " ")} verification rejected.`);
      } else if (dialog.kind === "reject-vendor") {
        await vendorApi.adminReject(dialog.vendor.id, { reason: trimmed });
        setMessage(`${dialog.vendor.displayName} has been rejected.`);
      } else {
        await vendorApi.adminSuspend(dialog.vendor.id, { reason: trimmed });
        setMessage(`${dialog.vendor.displayName} has been suspended.`);
      }
      setDialog(null);
      setReason("");
      await refreshAfterAction(vendorId, dialog.kind === "reject-verification");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not complete that review action."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="commerceStack" aria-labelledby="admin-vendors-heading">
      <div className="sectionHeadingCompact adminKycHeading">
        <div>
          <p className="eyebrow">Vendor operations</p>
          <h2 id="admin-vendors-heading">Vendors & verification</h2>
          <p>Review BUSINESS and IDENTITY checks, then approve or reject vendor applications.</p>
        </div>
        <button
          className="secondaryButton"
          type="button"
          disabled={listState === "loading"}
          onClick={() => void loadVendors()}
        >
          {listState === "loading" ? "Refreshing…" : "Refresh queue"}
        </button>
      </div>

      <div className="adminKycSecurityNote">
        <strong>Privileged review workflow</strong>
        <span>
          All review actions require an MFA-satisfied ADMIN or SUPER_ADMIN session and are audited
          by the API.
        </span>
      </div>

      <div className="adminKycFilters" role="group" aria-label="Vendor status filters">
        <button
          className={filter === "ALL" ? "adminKycFilter adminKycFilterActive" : "adminKycFilter"}
          type="button"
          onClick={() => setFilter("ALL")}
        >
          All
        </button>
        {vendorStatuses.map((status) => (
          <button
            key={status}
            className={filter === status ? "adminKycFilter adminKycFilterActive" : "adminKycFilter"}
            type="button"
            onClick={() => setFilter(status)}
          >
            {status.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {message ? (
        <p className="formMessage formMessageSuccess" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="formMessage formMessageError" role="alert">
          {error}
        </p>
      ) : null}

      {dialog ? (
        <div
          className="adminKycReviewPanel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-kyc-review-title"
        >
          <div>
            <p className="eyebrow">Reason required</p>
            <h3 id="admin-kyc-review-title">
              {dialog.kind === "reject-verification"
                ? `Reject ${dialog.verification.type} verification`
                : dialog.kind === "reject-vendor"
                  ? `Reject ${dialog.vendor.displayName}`
                  : `Suspend ${dialog.vendor.displayName}`}
            </h3>
          </div>
          <label className="field">
            Review reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="State the specific reason for this decision."
            />
          </label>
          <div className="actionRow">
            <button
              className="dangerButton"
              type="button"
              disabled={busy !== null}
              onClick={() => void submitReasonedAction()}
            >
              {busy ? "Saving…" : "Confirm decision"}
            </button>
            <button
              className="secondaryButton"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setDialog(null);
                setReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {listState === "loading" ? <LoadingState label="Loading vendor review queue…" /> : null}
      {listState === "error" ? (
        <ErrorState
          title="Vendor queue unavailable"
          message={error ?? "CartNest could not load vendor applications."}
          action={
            <button className="secondaryButton" type="button" onClick={() => void loadVendors()}>
              Try again
            </button>
          }
        />
      ) : null}

      {listState === "ready" ? (
        <div className="adminKycWorkspace">
          <aside className="adminKycVendorList" aria-label="Vendor applications">
            <div className="adminKycVendorListHeader">
              <strong>
                {filter === "ALL" ? "All vendors" : `${filter.toLowerCase()} vendors`}
              </strong>
              <span>{vendors.length}</span>
            </div>
            {vendors.map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                className={
                  selectedId === vendor.id
                    ? "adminKycVendorButton adminKycVendorButtonActive"
                    : "adminKycVendorButton"
                }
                onClick={() => setSelectedId(vendor.id)}
              >
                <span>
                  <strong>{vendor.displayName}</strong>
                  <small>
                    {vendor.legalName ??
                      vendor.registrationNumber ??
                      vendor.id.slice(0, 8).toUpperCase()}
                  </small>
                </span>
                <span className={statusClass(vendor.status)}>{vendor.status}</span>
              </button>
            ))}
            {vendors.length === 0 ? (
              <div className="adminKycEmpty">
                <strong>No vendors in this queue</strong>
                <span>Choose another status filter or refresh.</span>
              </div>
            ) : null}
          </aside>

          <div className="adminKycDetail">
            {!selectedVendor ? (
              <div className="adminKycEmpty">
                <strong>Select a vendor</strong>
                <span>Choose an application to review its KYC records.</span>
              </div>
            ) : null}
            {selectedVendor ? (
              <>
                <header className="adminKycVendorHeader">
                  <div>
                    <p className="eyebrow">Vendor review</p>
                    <h3>{selectedVendor.displayName}</h3>
                    <p>
                      {selectedVendor.legalName ?? "Legal name not provided"}
                      {selectedVendor.registrationNumber
                        ? ` · ${selectedVendor.registrationNumber}`
                        : ""}
                    </p>
                  </div>
                  <span className={statusClass(selectedVendor.status)}>
                    {selectedVendor.status}
                  </span>
                </header>

                {verificationState === "loading" ? (
                  <LoadingState label="Loading verification records…" />
                ) : null}
                {verificationState === "error" ? (
                  <ErrorState
                    title="Verification records unavailable"
                    message={error ?? "Could not load verification records."}
                    action={
                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={() => void loadVerifications(selectedVendor.id)}
                      >
                        Try again
                      </button>
                    }
                  />
                ) : null}
                {verificationState === "ready" ? (
                  <>
                    <div className="adminKycSummary">
                      <div>
                        <span>Required KYC</span>
                        <strong>{requiredCompleted}/2</strong>
                        <small>BUSINESS + IDENTITY</small>
                      </div>
                      <div>
                        <span>Business</span>
                        <strong>
                          {business ? effectiveVerificationStatus(business) : "NOT SUBMITTED"}
                        </strong>
                        <small>
                          {business
                            ? `Updated ${formatDate(business.updatedAt)}`
                            : "Waiting for vendor"}
                        </small>
                      </div>
                      <div>
                        <span>Identity</span>
                        <strong>
                          {identity ? effectiveVerificationStatus(identity) : "NOT SUBMITTED"}
                        </strong>
                        <small>
                          {identity
                            ? `Updated ${formatDate(identity.updatedAt)}`
                            : "Waiting for vendor"}
                        </small>
                      </div>
                    </div>

                    <div className="adminKycApprovalBar">
                      <div>
                        <strong>
                          {approvalReady ? "Required KYC complete" : "Vendor approval is locked"}
                        </strong>
                        <span>
                          {approvalReady
                            ? "BUSINESS and IDENTITY are verified and current."
                            : "Verify current BUSINESS and IDENTITY records before approval."}
                        </span>
                      </div>
                      <div className="actionRow">
                        {selectedVendor.status !== "APPROVED" ? (
                          <button
                            className="primaryButton"
                            type="button"
                            disabled={!approvalReady || busy !== null}
                            onClick={() => void approveVendor(selectedVendor)}
                          >
                            Approve vendor
                          </button>
                        ) : null}
                        {selectedVendor.status === "PENDING" ? (
                          <button
                            className="dangerButton"
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              openDialog({ kind: "reject-vendor", vendor: selectedVendor })
                            }
                          >
                            Reject vendor
                          </button>
                        ) : null}
                        {selectedVendor.status === "APPROVED" ? (
                          <button
                            className="dangerButton"
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              openDialog({ kind: "suspend-vendor", vendor: selectedVendor })
                            }
                          >
                            Suspend vendor
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="adminKycRecords">
                      <div className="adminKycRecordsHeading">
                        <strong>Verification records</strong>
                        <span>
                          Review each submission before making the vendor-level approval decision.
                          The latest BUSINESS and IDENTITY records control eligibility.
                        </span>
                      </div>
                      {verifications
                        .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                        .map((item) => (
                          <article className="adminKycRecord" key={item.id}>
                            <div className="adminKycRecordMain">
                              <div className="adminKycRecordTitle">
                                <strong>{item.type.replaceAll("_", " ")}</strong>
                                <span className={statusClass(effectiveVerificationStatus(item))}>
                                  {effectiveVerificationStatus(item)}
                                </span>
                              </div>
                              <dl>
                                <div>
                                  <dt>Reference</dt>
                                  <dd>{item.reference ?? "No reference supplied"}</dd>
                                </div>
                                <div>
                                  <dt>Submitted</dt>
                                  <dd>{formatDate(item.createdAt)}</dd>
                                </div>
                                <div>
                                  <dt>Reviewed</dt>
                                  <dd>
                                    {item.reviewedAt ? formatDate(item.reviewedAt) : "Not reviewed"}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Reviewer</dt>
                                  <dd>{item.reviewedBy ?? "—"}</dd>
                                </div>
                                <div>
                                  <dt>Expires</dt>
                                  <dd>{formatDate(item.expiresAt)}</dd>
                                </div>
                              </dl>
                            </div>
                            {item.status === "PENDING" ? (
                              <div className="adminKycRecordActions">
                                <button
                                  className="primaryButton"
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => void verifyRecord(item)}
                                >
                                  {busy === `verification:${item.id}` ? "Verifying…" : "Verify"}
                                </button>
                                <button
                                  className="dangerButton"
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    openDialog({ kind: "reject-verification", verification: item })
                                  }
                                >
                                  Reject
                                </button>
                              </div>
                            ) : null}
                          </article>
                        ))}
                      {verifications.length === 0 ? (
                        <div className="adminKycEmpty">
                          <strong>No verification submissions</strong>
                          <span>The vendor has not submitted any KYC reference yet.</span>
                        </div>
                      ) : null}
                    </div>

                    <AdminVendorSettlement
                      vendorId={selectedVendor.id}
                      bankVerificationReady={bankVerificationReady}
                      vendorApproved={selectedVendor.status === "APPROVED"}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
