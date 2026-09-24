import { spawn } from "node:child_process";
import { createServer } from "node:http";

const children = new Set();
const port = Number(process.env.PORT ?? "10000");
const host = process.env.HOST ?? "0.0.0.0";
let stopping = false;
let bootstrapServer;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;

  if (bootstrapServer) {
    bootstrapServer.close();
    bootstrapServer = undefined;
  }

  for (const child of children) child.kill("SIGTERM");

  const timeout = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 25_000);
  timeout.unref();
}

function launch(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });

  children.add(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 1);
  });

  return child;
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function startBootstrapServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");

      if (request.url === "/health" || request.url === "/api/health" || request.url === "/") {
        response.statusCode = 200;
        response.end(JSON.stringify({
          status: "starting",
          service: "cartnest-api",
          phase: "database-migrations",
        }));
        return;
      }

      response.statusCode = 503;
      response.setHeader("retry-after", "5");
      response.end(JSON.stringify({
        error: {
          code: "SERVICE_STARTING",
          message: "CartNest is finishing startup tasks. Retry shortly.",
        },
      }));
    });

    server.once("error", reject);
    server.listen(port, host, () => {
      bootstrapServer = server;
      console.info(JSON.stringify({
        level: "info",
        message: "CartNest startup health server listening",
        host,
        port,
      }));
      resolve();
    });
  });
}

function stopBootstrapServer() {
  return new Promise((resolve, reject) => {
    if (!bootstrapServer) {
      resolve();
      return;
    }

    const server = bootstrapServer;
    bootstrapServer = undefined;
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop());
}

async function main() {
  // Bind Render's public port immediately so long-running database migrations
  // do not trigger the platform's "no open ports" startup scanner.
  await startBootstrapServer();

  // Apply reviewed migrations before the production API begins accepting
  // marketplace traffic. Never use prisma db push in production.
  const migration = spawn("pnpm", ["--filter", "@repo/database", "db:migrate:deploy"], {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  children.add(migration);

  const migrationCode = await waitForChild(migration);
  children.delete(migration);

  if (migrationCode !== 0 || stopping) {
    stop(migrationCode || 1);
    return;
  }

  await stopBootstrapServer();
  if (stopping) return;

  // Render now exposes Fastify directly. The storefront remains on Vercel and
  // rewrites /api/v1/* to this service, so a second Next.js server is neither
  // required nor desirable on the API instance.
  launch(process.execPath, ["apps/api/dist/server.js"], {
    PORT: String(port),
    HOST: "0.0.0.0",
  });
  launch(process.execPath, ["apps/worker/dist/index.js"]);
}

void main().catch((error) => {
  console.error(JSON.stringify({
    level: "error",
    message: "CartNest Render startup failed",
    error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown startup error",
  }));
  stop(1);
});
