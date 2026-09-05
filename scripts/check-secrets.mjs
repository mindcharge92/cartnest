import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "node_modules", "dist", "coverage"]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".sql", ".prisma", ".sh", ".ps1",
]);

const PATTERNS = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Paystack secret key", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: "Flutterwave secret key", regex: /\bFLWSECK(?:_TEST)?-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", regex: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/ },
  { name: "OpenAI secret key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (TEXT_EXTENSIONS.has(extname(entry.name)) || entry.name.startsWith(".env")) files.push(path);
  }
  return files;
}

const findings = [];
for (const path of await walk(ROOT)) {
  const text = await readFile(path, "utf8");
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(text)) findings.push(`${pattern.name}: ${relative(ROOT, path)}`);
  }
}

if (findings.length > 0) {
  console.error("Potential committed secrets detected:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Secret scan passed: no known high-confidence credential patterns found.");
}
