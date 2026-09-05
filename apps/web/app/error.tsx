"use client";

import { useEffect } from "react";
import { ErrorState } from "../components/page-state";

export default function ErrorPage({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error("CartNest route error", { name: error.name, digest: error.digest });
  }, [error]);

  return (
    <main className="pageShell">
      <ErrorState title="This page could not be loaded" message="Try the page again. If the problem continues, return to the marketplace and retry the action later." action={<button className="primaryButton" type="button" onClick={reset}>Try again</button>} />
    </main>
  );
}
