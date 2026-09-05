import { CARTNEST_NAME } from "@repo/ui";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="card">
        <p className="eyebrow">P0 · Repository Foundation</p>
        <h1>{CARTNEST_NAME}</h1>
        <p>
          The web application is running. Product features begin after the P0 repository and tooling
          quality gate passes.
        </p>
      </div>
    </main>
  );
}
