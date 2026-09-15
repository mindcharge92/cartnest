import { spawn } from "node:child_process";

const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timeout = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 25_000);
  timeout.unref();
}

function launch(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(), stdio: "inherit", shell: false,
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

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());

// Apply reviewed migrations before accepting traffic; never use db push.
const migration = spawn("pnpm", ["--filter", "@repo/database", "db:migrate:deploy"], {
  stdio: "inherit", shell: false, env: process.env,
});
children.add(migration);
migration.on("error", () => stop(1));
migration.on("exit", (code) => {
  children.delete(migration);
  if (code !== 0 || stopping) return stop(code || 1);
  launch(process.execPath, ["apps/api/dist/server.js"], { PORT: "4000", HOST: "127.0.0.1" });
  launch(process.execPath, ["apps/worker/dist/index.js"]);
  launch(process.execPath, ["apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", process.env.PORT ?? "10000", "-H", "0.0.0.0"]);
});
