import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: Readonly<{ label?: string }>) {
  return (
    <div className="stateCard" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
}: Readonly<{ title?: string; message: string; action?: ReactNode }>) {
  return (
    <div className="stateCard stateCardError" role="alert">
      <span className="stateMark" aria-hidden="true">!</span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action ? <div className="stateAction">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: Readonly<{ title: string; message: string; action?: ReactNode }>) {
  return (
    <div className="stateCard">
      <span className="stateMark stateMarkMuted" aria-hidden="true">○</span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action ? <div className="stateAction">{action}</div> : null}
      </div>
    </div>
  );
}
