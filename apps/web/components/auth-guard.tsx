"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "./session-provider";
import { ErrorState, LoadingState } from "./page-state";

type PlatformRole = NonNullable<ReturnType<typeof useSession>["session"]>["user"]["platformRole"];

export function AuthGuard({
  children,
  roles,
  requireMfa = false,
}: Readonly<{
  children: ReactNode;
  roles?: readonly PlatformRole[];
  requireMfa?: boolean;
}>) {
  const { session, status, reloadSession } = useSession();

  if (status === "loading") return <LoadingState label="Checking your CartNest session…" />;

  if (status === "error") {
    return (
      <ErrorState
        title="Session service unavailable"
        message="CartNest could not confirm your session. Your account has not been signed out automatically."
        action={<button className="secondaryButton" type="button" onClick={() => void reloadSession()}>Try again</button>}
      />
    );
  }

  if (!session) {
    return (
      <ErrorState
        title="Sign in required"
        message="Sign in to continue to this part of CartNest."
        action={<Link className="primaryButton" href="/login">Sign in</Link>}
      />
    );
  }

  if (roles && !roles.includes(session.user.platformRole)) {
    return <ErrorState title="Access restricted" message="Your account does not have access to this workspace." />;
  }

  if (requireMfa && !session.mfa.satisfied) {
    return (
      <ErrorState
        title="MFA verification required"
        message="Verify your authenticator code before continuing with this privileged action."
        action={<Link className="primaryButton" href="/mfa">Verify MFA</Link>}
      />
    );
  }

  return <>{children}</>;
}
