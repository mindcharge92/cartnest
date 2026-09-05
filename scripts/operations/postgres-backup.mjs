import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const url = new URL(databaseUrl);
if (!url.protocol.startsWith("postgres")) throw new Error("DATABASE_URL must be PostgreSQL.");

const backupDir = resolve(process.env.BACKUP_DIR ?? "backups");
await mkdir(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const output = resolve(backupDir, `cartnest-${timestamp}.dump`);

const args = [
  "--host", url.hostname,
  "--port", url.port || "5432",
  "--username", decodeURIComponent(url.username),
  "--dbname", decodeURIComponent(url.pathname.slice(1)),
  "--format=custom",
  "--no-owner",
  "--no-acl",
  "--file", output,
];

const child = spawn("pg_dump", args, {
  stdio: "inherit",
  env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
});

const exitCode = await new Promise((resolveCode, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveCode(code ?? 1));
});
if (exitCode !== 0) throw new Error(`pg_dump exited with code ${exitCode}.`);
console.log(`PostgreSQL backup written to ${output}`);
