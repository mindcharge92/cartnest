export interface WorkerHealth {
  readonly status: "ok";
  readonly service: "cartnest-worker";
  readonly uptimeSeconds: number;
}

export function getWorkerHealth(): WorkerHealth {
  return {
    status: "ok",
    service: "cartnest-worker",
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
