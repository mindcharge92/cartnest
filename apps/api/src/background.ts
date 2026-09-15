import type { FastifyInstance } from "fastify";

export interface BackgroundTask {
  readonly name: string;
  readonly run: () => Promise<unknown>;
}

/** Domain services retain authority; database locking and provider keys guard effects. */
export function registerBackgroundTasks(app: FastifyInstance, tasks: readonly BackgroundTask[]): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<void> | undefined;
  let closed = false;

  async function run(): Promise<void> {
    for (const task of tasks) {
      if (closed) break;
      try {
        await task.run();
      } catch {
        app.log.error({ task: task.name }, "Background task failed; retrying on the next interval");
      }
    }
  }

  function tick(): void {
    if (closed || active) return;
    active = run().finally(() => { active = undefined; });
  }

  app.addHook("onListen", async () => {
    tick();
    timer = setInterval(tick, 60_000);
    timer.unref();
  });
  app.addHook("onClose", async () => {
    closed = true;
    if (timer) clearInterval(timer);
    await active;
  });
}
