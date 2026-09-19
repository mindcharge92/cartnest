# Storefront UI hierarchy decision

Status: adopted locally, 2026-09-18.

## Context and decision

The public storefront previously led with large decorative artwork and generic category links. The catalogue was empty in the current local environment, so product-led browsing must also work honestly without published inventory. Buyer checkout and operational workspaces need clearer task order on small screens.

Keep the existing Next.js App Router, API client, contract DTOs, and CSS files. Fetch public homepage categories and newest products through the existing catalogue API, render actual listings when available, and show a truthful empty or retry state otherwise. Use a compact shared header, focused auth/checkout header, collapsible mobile filters, and mobile workspace navigation. Do not add a UI framework, new service, or mock product data.

## Quality targets and tradeoffs

- Security and correctness: retain existing auth guards and backend-authoritative prices, stock, delivery, and order creation. Public catalogue data is read-only; no secret moves into the client.
- Reliability: catalogue failures show retry; no published products is distinguished from filtered-out results. Existing order and payment workflows are unchanged.
- Accessibility: visible text labels, keyboard-operable native controls, semantic headings, and no horizontal overflow at 390px are the local targets. Screen-reader and populated-catalogue testing remain to be completed.
- Performance and cost: reuse existing API calls and CSS; no dependency or hosting cost added. The public homepage uses client-side catalogue fetches, so product content appears after hydration; server rendering would improve first paint and SEO but needs a validated server-side API strategy.
- Maintainability and delivery: use feature-local homepage data logic and a final visual CSS layer, leaving existing domain flows intact. This is reversible by removing that component and stylesheet import.
- Operability and scale: API error states remain visible. Catalogue paging stays in the existing API; no new scaling or observability boundary is introduced.

## Alternatives and reassessment

Static sample products were rejected because they would misrepresent live inventory. A new design system was rejected because it adds migration cost without addressing flow hierarchy. Reassess server-rendered discovery when live catalogue volume, SEO requirements, or measured loading latency justify it. Reassess the shared stylesheet after authenticated mobile QA identifies patterns worth moving into feature styles.

Verification: local web typecheck, ESLint, tests, production build, and browser checks at desktop and 390px. Authenticated seller/admin and populated-catalogue visual QA are not covered by the current empty local data/session state.
