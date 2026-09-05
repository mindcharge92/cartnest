import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildApp } from "../app.js";

const app = buildApp({ logger: false });

try {
  await app.ready();
  const specification = app.swagger();
  const outputDirectory = resolve(process.cwd(), "../../openapi");
  const outputFile = resolve(outputDirectory, "cartnest.openapi.json");

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(specification, null, 2)}\n`, "utf8");
  process.stdout.write(`OpenAPI written to ${outputFile}\n`);
} finally {
  await app.close();
}
