import { Suspense } from "react";
import { LoadingState } from "../../components/page-state";
import { MarketplaceBrowser } from "../../features/catalog/marketplace-browser";

export default function MarketplacePage() {
  return (
    <Suspense fallback={<main className="pageShell"><LoadingState label="Loading marketplace…" /></main>}>
      <MarketplaceBrowser />
    </Suspense>
  );
}
