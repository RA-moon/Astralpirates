import { Counter, Gauge, Pushgateway, Registry } from 'prom-client';

type Logger = {
  info?: (meta: Record<string, unknown>, message?: string) => void;
  warn?: (meta: Record<string, unknown>, message?: string) => void;
};

type MetricsHandles = {
  connections: Gauge<string>;
  events: Counter<string>;
  errors: Counter<string>;
  push: () => Promise<void>;
};

let cached: MetricsHandles | null = null;

const init = (logger: Logger): MetricsHandles | null => {
  const registry = new Registry();
  const connections = new Gauge({
    name: 'flight_plan_task_stream_connections',
    help: 'Active SSE connections for flight-plan task streams',
    registers: [registry],
  });
  const events = new Counter({
    name: 'flight_plan_task_stream_events_total',
    help: 'Task stream events emitted to clients',
    labelNames: ['type'],
    registers: [registry],
  });
  const errors = new Counter({
    name: 'flight_plan_task_stream_errors_total',
    help: 'Errors encountered while handling task streams',
    labelNames: ['stage'],
    registers: [registry],
  });

  const pushUrl = process.env.TASK_STREAM_PROM_PUSHGATEWAY_URL;
  const pushJobName = process.env.TASK_STREAM_PROM_PUSH_JOB_NAME ?? 'flight-plan-task-stream';
  const pushIntervalMs =
    Number.parseInt(process.env.TASK_STREAM_PROM_PUSH_INTERVAL_MS ?? '60000', 10) || 60000;
  const pushGateway = pushUrl ? new Pushgateway(pushUrl, {}, registry) : null;
  let pushing = false;

  const push = async () => {
    if (!pushGateway || pushing) return;
    pushing = true;
    setTimeout(async () => {
      try {
        await pushGateway.pushAdd({ jobName: pushJobName });
      } catch (error) {
        logger.warn?.({ err: error }, '[task-stream-metrics] push failed');
      } finally {
        pushing = false;
      }
    }, pushIntervalMs).unref?.();
  };

  return { connections, events, errors, push };
};

export const getTaskStreamMetrics = (logger: Logger): MetricsHandles | null => {
  if (cached) return cached;
  cached = init(logger);
  return cached;
};
