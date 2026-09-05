import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildApp } from "../app.js";

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObject(child)]),
    );
  }
  return value;
}

const app = buildApp(
  { logger: false },
  { database: async () => true, redis: async () => true },
);

try {
  await app.ready();
  const specification = sortObject(app.swagger());
  const outputDirectory = resolve(process.cwd(), "../../openapi");
  const outputFile = resolve(outputDirectory, "cartnest.openapi.json");

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(specification, null, 2)}\n`, "utf8");
  process.stdout.write(`OpenAPI written to ${outputFile}\n`);
} finally {
  await app.close();
}
