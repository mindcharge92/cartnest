import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
const restoreFile = process.env.RESTORE_FILE;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!restoreFile) throw new Error("RESTORE_FILE is required.");
if (process.env.CONFIRM_RESTORE !== "YES") {
  throw new Error("Set CONFIRM_RESTORE=YES after verifying the target database and restore file.");
}

const path = resolve(restoreFile);
await access(path);
const url = new URL(databaseUrl);
if (!url.protocol.startsWith("postgres")) throw new Error("DATABASE_URL must be PostgreSQL.");

const args = [
  "--host", url.hostname,
  "--port", url.port || "5432",
  "--username", decodeURIComponent(url.username),
  "--dbname", decodeURIComponent(url.pathname.slice(1)),
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-acl",
  "--exit-on-error",
  "--single-transaction",
  path,
];

const child = spawn("pg_restore", args, {
  stdio: "inherit",
  env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
});

const exitCode = await new Promise((resolveCode, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveCode(code ?? 1));
});
if (exitCode !== 0) throw new Error(`pg_restore exited with code ${exitCode}.`);
console.log(`PostgreSQL restore completed from ${path}`);
