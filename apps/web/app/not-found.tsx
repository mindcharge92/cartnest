import Link from "next/link";
import { EmptyState } from "../components/page-state";

export default function NotFound() {
  return (
    <main className="pageShell">
      <EmptyState title="Page not found" message="The CartNest page you requested does not exist or may have moved." action={<Link className="primaryButton" href="/">Back to marketplace</Link>} />
    </main>
  );
}
