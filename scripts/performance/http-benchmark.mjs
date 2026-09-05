import { performance } from "node:perf_hooks";

const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:4000";
const path = process.env.BENCHMARK_PATH ?? "/health";
const method = (process.env.BENCHMARK_METHOD ?? "GET").toUpperCase();
const totalRequests = Number(process.env.BENCHMARK_REQUESTS ?? "100");
const concurrency = Number(process.env.BENCHMARK_CONCURRENCY ?? "10");
const maxP95Ms = Number(process.env.BENCHMARK_MAX_P95_MS ?? "2000");
const maxErrorRate = Number(process.env.BENCHMARK_MAX_ERROR_RATE ?? "0.01");
const staticHeaders = process.env.BENCHMARK_HEADERS_JSON
  ? JSON.parse(process.env.BENCHMARK_HEADERS_JSON)
  : {};
const body = process.env.BENCHMARK_BODY_JSON;

if (!Number.isInteger(totalRequests) || totalRequests < 1) throw new Error("BENCHMARK_REQUESTS must be a positive integer.");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > totalRequests) throw new Error("BENCHMARK_CONCURRENCY must be between 1 and BENCHMARK_REQUESTS.");

const url = new URL(path, baseUrl).toString();
let cursor = 0;
const results = [];

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= totalRequests) return;
    const headers = { ...staticHeaders };
    if (process.env.BENCHMARK_UNIQUE_IDEMPOTENCY === "true") {
      headers["idempotency-key"] = `p11-benchmark-${Date.now()}-${index}`;
    }
    const started = performance.now();
    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body ? { body } : {}),
      });
      await response.arrayBuffer();
      results.push({ durationMs: performance.now() - started, ok: response.ok, status: response.status });
    } catch {
      results.push({ durationMs: performance.now() - started, ok: false, status: 0 });
    }
  }
}

const wallStart = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const wallMs = performance.now() - wallStart;
const durations = results.map((item) => item.durationMs).sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] ?? 0;
const errors = results.filter((item) => !item.ok).length;
const errorRate = errors / results.length;

const report = {
  url,
  method,
  requests: results.length,
  concurrency,
  wallMs: Math.round(wallMs),
  requestsPerSecond: Number((results.length / (wallMs / 1000)).toFixed(2)),
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
  errors,
  errorRate,
  statusCounts: Object.fromEntries(
    [...new Set(results.map((item) => item.status))]
      .sort((a, b) => a - b)
      .map((status) => [String(status), results.filter((item) => item.status === status).length]),
  ),
};

console.log(JSON.stringify(report, null, 2));
if (report.p95Ms > maxP95Ms) {
  console.error(`P95 ${report.p95Ms}ms exceeds budget ${maxP95Ms}ms.`);
  process.exitCode = 1;
}
if (errorRate > maxErrorRate) {
  console.error(`Error rate ${errorRate} exceeds budget ${maxErrorRate}.`);
  process.exitCode = 1;
}
