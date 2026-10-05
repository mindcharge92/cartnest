"use client";

import type {
  PaymentProviderAccountDto,
  PaymentProviderDto,
  ProviderAccountStatusDto,
} from "@repo/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, vendorApi } from "../../lib/api";

const providers: readonly PaymentProviderDto[] = ["PAYSTACK", "FLUTTERWAVE"];

type StatusAction = {
  provider: PaymentProviderDto;
  status: Extract<ProviderAccountStatusDto, "SUSPENDED" | "DISABLED">;
};

function providerLabel(provider: PaymentProviderDto): string {
  return provider === "PAYSTACK" ? "Paystack" : "Flutterwave";
}

export function AdminVendorSettlement({
  vendorId,
  bankVerificationReady,
  vendorApproved,
}: {
  vendorId: string;
  bankVerificationReady: boolean;
  vendorApproved: boolean;
}) {
  const [accounts, setAccounts] = useState<readonly PaymentProviderAccountDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [provider, setProvider] = useState<PaymentProviderDto>("PAYSTACK");
  const [externalSubaccountId, setExternalSubaccountId] = useState("");
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activationReady = bankVerificationReady && vendorApproved;

  const byProvider = useMemo(
    () => new Map(accounts.map((account) => [account.provider, account])),
    [accounts],
  );

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await vendorApi.adminListProviderAccounts(vendorId);
      setAccounts(response.items);
      setState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not load settlement accounts."));
      setState("error");
    }
  }, [vendorId]);

  useEffect(() => {
    setStatusAction(null);
    setReason("");
    setExternalSubaccountId("");
    setMessage(null);
    void load();
  }, [load]);

  async function recordAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accountId = externalSubaccountId.trim();
    if (!accountId) {
      setError("Enter the provider subaccount identifier.");
      return;
    }
    setBusy(`record:${provider}`);
    setError(null);
    setMessage(null);
    try {
      await vendorApi.adminRecordProviderAccount(vendorId, {
        provider,
        externalSubaccountId: accountId,
      });
      setExternalSubaccountId("");
      setMessage(`${providerLabel(provider)} settlement account saved.`);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not save that settlement account."));
    } finally {
      setBusy(null);
    }
  }

  async function activate(providerName: PaymentProviderDto) {
    setBusy(`status:${providerName}`);
    setError(null);
    setMessage(null);
    try {
      await vendorApi.adminUpdateProviderAccountStatus(vendorId, providerName, {
        status: "ACTIVE",
      });
      setMessage(`${providerLabel(providerName)} provider account activated.`);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not activate settlement."));
    } finally {
      setBusy(null);
    }
  }

  async function submitStatusAction() {
    if (!statusAction) return;
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      setError("Enter a clear reason before changing settlement status.");
      return;
    }
    const { provider: providerName, status } = statusAction;
    setBusy(`status:${providerName}`);
    setError(null);
    setMessage(null);
    try {
      await vendorApi.adminUpdateProviderAccountStatus(vendorId, providerName, {
        status,
        reason: trimmed,
      });
      setStatusAction(null);
      setReason("");
      setMessage(`${providerLabel(providerName)} settlement ${status.toLowerCase()}.`);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not change settlement status."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="adminSettlement" aria-labelledby="admin-settlement-heading">
      <div className="adminKycRecordsHeading">
        <strong id="admin-settlement-heading">Settlement accounts</strong>
        <span>
          Provider settlement can only be activated when the latest BANK ACCOUNT verification is
          verified and current.
        </span>
      </div>

      {message ? <p className="formMessage formMessageSuccess">{message}</p> : null}
      {error ? <p className="formMessage formMessageError">{error}</p> : null}

      <p className="adminSettlementPolicyNote">
        Provider-account activation marks the account eligible for settlement operations. CartNest
        still keeps collection-time gateway splits disabled so delivery-gated settlement policy is
        not bypassed.
      </p>

      <div
        className={
          activationReady ? "adminSettlementGate adminSettlementGateReady" : "adminSettlementGate"
        }
      >
        <strong>
          {activationReady ? "Settlement activation ready" : "Settlement activation locked"}
        </strong>
        <span>
          {!vendorApproved
            ? "Approve the vendor before enabling provider settlement."
            : bankVerificationReady
              ? "The approved vendor has a current verified bank check."
              : "Review and verify the vendor's latest BANK ACCOUNT submission first."}
        </span>
      </div>

      <form className="adminSettlementForm" onSubmit={recordAccount}>
        <label className="field">
          Payment provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as PaymentProviderDto)}
          >
            {providers.map((item) => (
              <option value={item} key={item}>
                {providerLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="field adminSettlementAccountField">
          Provider subaccount ID
          <input
            value={externalSubaccountId}
            onChange={(event) => setExternalSubaccountId(event.target.value)}
            maxLength={200}
            placeholder="e.g. ACCT_..."
          />
        </label>
        <button className="secondaryButton" type="submit" disabled={busy !== null}>
          {busy === `record:${provider}` ? "Saving…" : "Save account"}
        </button>
      </form>

      {statusAction ? (
        <div className="adminSettlementReason">
          <label className="field">
            Reason for {statusAction.status.toLowerCase()}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="State why settlement access is changing."
            />
          </label>
          <div className="actionRow">
            <button
              className="dangerButton"
              type="button"
              disabled={busy !== null}
              onClick={() => void submitStatusAction()}
            >
              Confirm {statusAction.status.toLowerCase()}
            </button>
            <button
              className="secondaryButton"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setStatusAction(null);
                setReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state === "loading" ? <LoadingState label="Loading settlement accounts…" /> : null}
      {state === "error" ? (
        <ErrorState
          title="Settlement accounts unavailable"
          message={error ?? "CartNest could not load settlement accounts."}
          action={
            <button className="secondaryButton" type="button" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      ) : null}
      {state === "ready" ? (
        <div className="adminSettlementGrid">
          {providers.map((providerName) => {
            const account = byProvider.get(providerName);
            return (
              <article className="adminSettlementCard" key={providerName}>
                <div>
                  <strong>{providerLabel(providerName)}</strong>
                  <span className="statusPill">{account?.status ?? "NOT CONFIGURED"}</span>
                </div>
                <p>
                  {account?.externalSubaccountId ?? "No provider subaccount has been recorded."}
                </p>
                {account ? (
                  <div className="actionRow">
                    {account.status !== "ACTIVE" ? (
                      <button
                        className="primaryButton"
                        type="button"
                        disabled={!activationReady || busy !== null}
                        onClick={() => void activate(providerName)}
                      >
                        {busy === `status:${providerName}` ? "Updating…" : "Activate"}
                      </button>
                    ) : null}
                    {account.status === "ACTIVE" ? (
                      <button
                        className="secondaryButton"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setReason("");
                          setStatusAction({ provider: providerName, status: "SUSPENDED" });
                        }}
                      >
                        Suspend
                      </button>
                    ) : null}
                    {account.status !== "DISABLED" ? (
                      <button
                        className="dangerButton"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setReason("");
                          setStatusAction({ provider: providerName, status: "DISABLED" });
                        }}
                      >
                        Disable
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
