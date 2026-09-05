# CartNest Backup & Disaster Recovery Plan

**Status:** Production baseline  
**Last updated:** 5 September 2026  
**Scope:** PostgreSQL, media, configuration, secrets, application releases, Redis/job recovery

## 1. Purpose

Backups are useful only if they can be restored. This document defines what CartNest backs up, recovery objectives, backup isolation, validation, restore procedures, and disaster scenarios.

Financial/order/payment state in PostgreSQL is the highest-priority recoverable asset. Redis/queue state is important operationally but must not be the only copy of critical business truth.

## 2. Recovery Objectives

Initial internal targets:

| Asset | RPO Target | RTO Target |
| --- | --- | --- |
| PostgreSQL transactional data | <= 15 minutes | <= 4 hours |
| R2 media | <= 24 hours for independent backup copy | <= 24 hours |
| application source/images | effectively 0 through Git/GHCR | <= 2 hours |
| secrets/configuration | latest controlled version | <= 4 hours |
| Redis queue state | reconstruct critical work from PostgreSQL/outbox | <= 2 hours |

RPO/RTO are engineering targets and should be revisited as transaction volume/business obligations increase.

## 3. Backup Strategy — PostgreSQL

### Preferred production database

Use a managed PostgreSQL provider that supports automated backups and point-in-time recovery (PITR) where feasible.

Required controls:

- automated continuous/PITR backups;
- at least daily snapshot/full backup according to provider capability;
- retention sufficient to cover operational discovery delays;
- restore to a separate database/instance for testing;
- alert on backup/PITR failure.

### Independent logical backup

Even with managed backups, create an independent encrypted logical backup on a schedule (baseline: nightly):

```text
pg_dump custom format
  -> compress/encrypt
  -> upload to dedicated backup storage
  -> checksum/manifest
  -> retention policy
```

The independent backup should not share the same deletion credentials as the primary production database.

## 4. Self-Hosted PostgreSQL Exception

If production PostgreSQL is self-hosted, the minimum changes:

- continuous WAL archiving to remote storage;
- automated base backups;
- nightly logical backup;
- monitoring of WAL archive freshness;
- tested PITR procedure;
- database data volume is not the backup;
- backups leave the application VPS.

A self-hosted database without off-host restore-tested backups is not production-ready.

## 5. PostgreSQL Retention Baseline

Recommended starting retention:

```text
PITR/WAL window:           7–14 days minimum
nightly logical backups:   14 daily copies
weekly logical backups:    8 weekly copies
monthly archival backup:   6–12 months if business/legal policy requires
```

Final retention is subject to NDPR, accounting, legal, and business requirements. Retention should not preserve unnecessary PII forever merely because storage is inexpensive.

## 6. Backup Encryption and Access

- encryption in transit;
- encrypted backup artifacts at rest;
- backup encryption keys separated from ordinary application credentials;
- only deployment/operations identities may create backups;
- restore permission is more restricted than read-only application access;
- backup deletion is protected from ordinary application credentials;
- backup access is reviewed periodically.

## 7. Backup Integrity

Each logical backup stores metadata:

```text
backupId
createdAt
source environment
database identifier
Git/release SHA if useful
schema migration version
file size
SHA-256 checksum
encryption information/key reference
```

A successful upload alone is not proof of a usable backup.

## 8. Restore Testing

### Monthly minimum during active development/launch period

1. select a recent backup;
2. restore into isolated non-production PostgreSQL;
3. apply required configuration/extensions;
4. run schema validation;
5. run row-count/invariant checks;
6. run critical read-only smoke queries;
7. document elapsed restore time;
8. destroy isolated restored copy securely after validation.

### Quarterly disaster drill

Perform a fuller application restore including API/worker connection and representative order/payment lookups.

## 9. R2 Media Protection

Cloudflare R2 is primary product/store media storage.

Controls:

- use server-generated object keys;
- accidental deletion protection through application authorization;
- use bucket locks where a retention use case requires immutable backup artifacts;
- lifecycle rules apply only to explicitly intended prefixes;
- production media bucket credentials must not have unnecessary bucket-admin capabilities in the application.

### Independent media backup

At least daily, inventory active media from PostgreSQL and copy newly changed objects to a dedicated backup bucket/account or alternate object-storage location.

Recommended structure:

```text
primary media bucket
  -> backup sync manifest
  -> backup bucket/account
       /YYYY/MM/DD/... or content-addressed/key-preserving layout
```

The backup credential must not be available to the ordinary web browser or product upload flow.

## 10. Object-Storage Lifecycle Safety

Before enabling an R2 lifecycle rule:

- review prefix scope;
- test in non-production;
- require code/ops review;
- document expected deletions;
- monitor initial execution.

Do not create broad expiration rules on the primary media bucket as an ad-hoc cleanup mechanism.

## 11. Application Source and Container Recovery

Source is protected through GitHub repository history.

Production container images are stored in GHCR with immutable SHA tags for a reasonable rollback window.

Recovery needs:

- repository access;
- known good commit;
- container build pipeline;
- deployment configuration;
- environment/secrets.

Do not rely solely on the currently running server filesystem as the only copy of deployment files.

## 12. Configuration Recovery

Non-secret configuration is version-controlled.

Secrets require a separate inventory including:

- name;
- environment;
- owning service/provider;
- rotation procedure;
- where securely stored;
- who can recover/recreate it.

Never place plaintext secret inventories inside this repository.

## 13. Redis and Job Recovery

Redis is not authoritative business storage.

Critical asynchronous actions use PostgreSQL OutboxEvent/provider-event/payment state so work can be re-driven after Redis loss.

After Redis loss:

1. restore/start Redis;
2. restart worker;
3. scan pending OutboxEvents;
4. scan pending/ambiguous payments;
5. expire/reconcile inventory reservations;
6. reschedule shipment sync;
7. verify notification backlog;
8. monitor duplicates through idempotency/dedupe controls.

## 14. Disaster Scenarios

### Application VPS destroyed

- provision replacement host;
- install Docker/Caddy tooling;
- restore deployment configuration;
- inject secrets;
- pull immutable images;
- connect managed DB/Redis or restore required services;
- update DNS if necessary;
- smoke test.

### PostgreSQL logical corruption/operator mistake

- stop harmful writes;
- identify incident timestamp;
- choose PITR target before corruption;
- restore into separate instance;
- validate data/invariants;
- switch application after approval;
- preserve original database for investigation where appropriate.

### Ransomware/credential compromise

- revoke compromised credentials;
- isolate affected hosts;
- do not overwrite evidence immediately;
- rotate secrets;
- restore from independent backup if integrity is uncertain;
- follow security incident runbook.

### R2 accidental deletion

- prevent further deletes;
- identify affected object keys from DB/audit/logs;
- restore from independent media backup;
- validate media metadata/object correspondence.

### GitHub/GHCR unavailable

Running services may continue. Avoid unnecessary redeploys. Maintain enough host-side immutable image cache/current compose configuration to restart the currently deployed release while upstream control plane recovers.

## 15. Database Restore Validation

Before a restored DB becomes production:

- Prisma migration table/version matches expected state;
- users/vendors/stores counts are plausible;
- order totals reconcile sample/invariant queries;
- no payment has duplicate successful capture state;
- refunds do not exceed captures;
- inventory constraints hold;
- provider event dedupe uniqueness holds;
- application can authenticate and read representative orders;
- worker starts without destructive replay.

## 16. Recovery Authority

High-impact restore/switchover should require explicit operator approval.

At minimum record:

```text
incident ID
reason
backup/restore point used
operator
start/end time
validation performed
new database/host identifier
DNS/config changes
```

## 17. Backup Failure Response

One missed backup is not silently ignored.

- page/escalate according to observability severity;
- determine whether PITR remains healthy;
- rerun logical backup;
- investigate storage/auth/disk errors;
- do not perform risky schema/deployment changes while recovery coverage is unknown.

## 18. Backup/DR Definition of Done

Production is not considered recoverable until:

- automated database backup is enabled;
- independent logical backup succeeds;
- checksums are recorded;
- media backup path exists;
- secret/config recovery inventory exists;
- at least one full database restore has been tested;
- restore time has been measured;
- Redis-loss reconstruction has been rehearsed;
- responsible operator knows the runbook location.

## 19. Cloudflare R2 References

Current R2 operational capabilities referenced by this plan include S3-compatible access, lifecycle rules, and bucket locks. Verify current behavior before applying production retention policies:

- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- https://developers.cloudflare.com/r2/buckets/bucket-locks/
