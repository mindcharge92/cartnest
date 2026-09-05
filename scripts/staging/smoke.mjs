import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const webBaseUrl = (process.env.STAGING_WEB_URL ?? "").replace(/\/$/, "");
const apiBaseUrl = (process.env.STAGING_API_URL ?? "").replace(/\/$/, "");
const timeoutMs = Number.parseInt(process.env.STAGING_SMOKE_TIMEOUT_MS ?? "10000", 10);
const releaseSha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? "unknown";

if (!webBaseUrl || !apiBaseUrl) {
  throw new Error("STAGING_WEB_URL and STAGING_API_URL are required.");
}

async function request(name, url, expectedStatuses = [200]) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "cartnest-p12-smoke/1" },
    });
    const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const bodyText = await response.text();
    let body;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText.slice(0, 500);
    }
    const result = {
      name,
      url,
      status: response.status,
      elapsedMs,
      ok: expectedStatuses.includes(response.status),
      headers: {
        cacheControl: response.headers.get("cache-control"),
        contentType: response.headers.get("content-type"),
        contentTypeOptions: response.headers.get("x-content-type-options"),
        frameOptions: response.headers.get("x-frame-options"),
        referrerPolicy: response.headers.get("referrer-policy"),
        hsts: response.headers.get("strict-transport-security"),
      },
      body,
    };
    if (!result.ok) {
      throw Object.assign(new Error(`${name} returned ${response.status}.`), { smokeResult: result });
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

const checks = [];
let failure;
for (const check of [
  ["web-health", `${webBaseUrl}/api/health`, [200]],
  ["api-health", `${apiBaseUrl}/health`, [200]],
  ["api-readiness", `${apiBaseUrl}/ready`, [200]],
  ["system-info", `${apiBaseUrl}/api/v1/system/info`, [200]],
  ["categories", `${apiBaseUrl}/api/v1/categories`, [200]],
  ["catalog", `${apiBaseUrl}/api/v1/catalog/products?page=1&pageSize=1`, [200]],
]) {
  try {
    checks.push(await request(check[0], check[1], check[2]));
  } catch (error) {
    if (error?.smokeResult) checks.push(error.smokeResult);
    failure ??= error;
  }
}

const apiHealth = checks.find((entry) => entry.name === "api-health");
const securityHeaderChecks = {
  nosniff: apiHealth?.headers.contentTypeOptions === "nosniff",
  frameDenied: apiHealth?.headers.frameOptions === "DENY",
  referrerRestricted: apiHealth?.headers.referrerPolicy === "no-referrer",
  hstsPresent: Boolean(apiHealth?.headers.hsts),
};

const evidence = {
  schemaVersion: 1,
  exercise: "p12-staging-smoke",
  recordedAt: new Date().toISOString(),
  releaseSha,
  webBaseUrl,
  apiBaseUrl,
  passed: !failure && Object.values(securityHeaderChecks).every(Boolean),
  securityHeaderChecks,
  checks,
};

const evidenceDir = resolve(process.env.P12_EVIDENCE_DIR ?? "artifacts/p12");
await mkdir(evidenceDir, { recursive: true });
const evidenceFile = resolve(evidenceDir, `smoke-${Date.now()}.json`);
await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
console.log(`P12 smoke evidence written to ${evidenceFile}`);

if (!evidence.passed) {
  process.exitCode = 1;
}
