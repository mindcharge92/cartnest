import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");
const failures = [];

async function* markdownFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(path);
    else if (entry.name.endsWith(".md")) yield path;
  }
}

for await (const file of markdownFiles(DOCS)) {
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1]?.trim();
    if (!target) continue;
    target = target.replace(/^<|>$/g, "").split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const [pathPart] = target.split("#");
    if (!pathPart) continue;
    const absolute = normalize(resolve(dirname(file), decodeURIComponent(pathPart)));
    if (!absolute.startsWith(ROOT)) { failures.push(`${file}: link escapes repository -> ${target}`); continue; }
    try { await access(absolute); } catch { failures.push(`${file}: missing local link target -> ${target}`); }
  }
}

if (failures.length) {
  console.error("Broken documentation links detected:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Documentation link check passed.");
