# ADR-011: Free preview runtime

Accepted for testing, 10 September 2026. Commercial launch remains gated by P12.

The user requires free platforms only. Render has free web, PostgreSQL and Key Value
instances, but no free dedicated worker. Vercel Hobby permits personal/non-commercial
use only. Therefore the default preview runs the existing web/API/worker processes in
one Render free web service. A supervisor terminates the complete service if a process
fails; migrations finish before listeners start. Same-origin Next.js API proxying
preserves HttpOnly/SameSite cookies and readable CSRF cookies without cross-site cookie
exceptions. No paid resource is declared.

Provider reconciliation and email delivery run bounded batches in the API process,
calling the existing domain services. The BullMQ worker retains outbox and inventory
ownership. Financial verification is provider-read-only before existing transactional
state application; automated retries never initiate a second charge. Email uses row
locks and stable provider idempotency keys, with a retry cutoff shorter than the
provider deduplication window. Shutdown drains active tasks.

This favors low cost and delivery speed over availability and independent scaling.
The service sleeps; maintenance pauses while asleep. Free PostgreSQL expires after
30 days, and free Key Value is not durable. PostgreSQL remains event authority.
Memory/latency must be measured on the target; no 512 MB capacity claim is made.
The existing separate-service Docker deployment remains the reversible upgrade path.
Reassess before live commerce, sustained traffic, independent scaling, or stronger SLOs.

Email delivery uses an optional Resend adapter; account/domain configuration is still
required. SMS has no configured free production provider and must fail explicitly.
Test adapters are local verification only. Never automatically upgrade plans.

Sources checked 8 September 2026:

- https://render.com/docs/free
- https://vercel.com/docs/plans/hobby
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/knowledge-base/account-quotas-and-limits
