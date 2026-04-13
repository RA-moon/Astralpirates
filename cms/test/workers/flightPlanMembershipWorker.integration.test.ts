import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueueFlightPlanMembershipEvent } from '@/src/utils/flightPlanMembershipEvents';
import { startFlightPlanMembershipWorker } from '@/src/workers/neo4j/flightPlanMembershipWorker';

const mockExecuteQuery = vi.fn(async () => ({ records: [] }));
const mockNeo4jDriver = {
  executeQuery: mockExecuteQuery,
  close: vi.fn(),
};

const mockPayloadInstance = {
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  update: vi.fn(async () => ({})),
  close: vi.fn(),
};

type FlightPlanMembershipRecord = {
  id: number;
  flightPlanId: number;
  userId: number;
  role: 'owner' | 'crew' | 'guest';
  status: 'accepted' | 'declined' | 'pending' | 'revoked';
  invitedAt: string | null;
  respondedAt: string | null;
};

const membership: FlightPlanMembershipRecord = {
  id: 1,
  flightPlanId: 99,
  userId: 10,
  role: 'crew',
  status: 'accepted',
  invitedAt: '2025-01-01T00:00:00.000Z',
  respondedAt: '2025-01-02T00:00:00.000Z',
};

const roster: FlightPlanMembershipRecord[] = [
  membership,
  {
    id: 2,
    flightPlanId: 99,
    userId: 20,
    role: 'crew',
    status: 'accepted',
    invitedAt: null,
    respondedAt: null,
  },
  {
    id: 3,
    flightPlanId: 99,
    userId: 30,
    role: 'guest',
    status: 'accepted',
    invitedAt: null,
    respondedAt: null,
  },
];

const queueRegistry = new Map<
  string,
  {
    jobs: any[];
    completed: number;
    failed: number;
  }
>();
const workerRegistry = new Map<string, Set<any>>();
const queueEventHandlers = new Map<string, { failed: Array<(payload: any) => void>; completed: Array<(payload: any) => void> }>();

const getQueueState = (name: string) => {
  if (!queueRegistry.has(name)) {
    queueRegistry.set(name, { jobs: [], completed: 0, failed: 0 });
  }
  return queueRegistry.get(name)!;
};

const dispatchJob = async (queueName: string, job: any) => {
  const workers = workerRegistry.get(queueName);
  if (!workers) return;

  for (const worker of workers) {
    await worker.handle(job);
  }
};

vi.mock('payload', () => {
  const init = vi.fn(async () => mockPayloadInstance);
  return {
    default: {
      init,
    },
  };
});

vi.mock('@/payload.config.ts', () => ({
  default: {},
}));

vi.mock('neo4j-driver', () => {
  const driver = () => mockNeo4jDriver;
  const auth = { basic: vi.fn(() => ({})) };
  return {
    default: {
      driver,
      auth,
    },
    driver,
    auth,
  };
});

vi.mock('prom-client', () => {
  class Gauge {
    value = 0;
    constructor() {}
    set(val: number) {
      this.value = val;
    }
  }
  class Registry {}
  class Pushgateway {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    async pushAdd() {}
    async delete() {}
  }
  return { Gauge, Registry, Pushgateway };
});

vi.mock('@/app/api/_lib/flightPlanMembers.ts', () => ({
  loadMembershipById: vi.fn(async () => membership),
  listMembershipsForFlightPlan: vi.fn(async () => roster),
}));

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }

    async add(jobName: string, data: any, options?: { jobId?: string }) {
      const state = getQueueState(this.name);
      const job = {
        id: options?.jobId ?? `${jobName}-${state.jobs.length + 1}`,
        name: jobName,
        data,
        attemptsMade: 0,
      };
      state.jobs.push(job);
      await dispatchJob(this.name, job);
      return job;
    }

    async getJobCounts() {
      const state = getQueueState(this.name);
      return {
        waiting: state.jobs.length,
        active: 0,
        delayed: 0,
        failed: state.failed,
        completed: state.completed,
      };
    }

    async clean() {
      const state = getQueueState(this.name);
      state.jobs = [];
      return [];
    }

    async drain() {
      const state = getQueueState(this.name);
      state.jobs = [];
      return 0;
    }

    async close() {}
  }

  class MockQueueEvents {
    queueName: string;
    constructor(queueName: string) {
      this.queueName = queueName;
      queueEventHandlers.set(queueName, { failed: [], completed: [] });
    }

    on(event: 'failed' | 'completed', handler: (payload: any) => void) {
      const handlers = queueEventHandlers.get(this.queueName);
      handlers?.[event].push(handler);
    }

    async waitUntilReady() {}

    async close() {
      queueEventHandlers.delete(this.queueName);
    }
  }

  class MockWorker {
    queueName: string;
    processor: (job: any) => Promise<void>;
    handlers: Record<string, Array<(...args: any[]) => void>>;

    constructor(queueName: string, processor: (job: any) => Promise<void>) {
      this.queueName = queueName;
      this.processor = processor;
      this.handlers = { ready: [], failed: [], completed: [] };
      if (!workerRegistry.has(queueName)) {
        workerRegistry.set(queueName, new Set());
      }
      workerRegistry.get(queueName)?.add(this);
    }

    on(event: 'ready' | 'failed' | 'completed', handler: (...args: any[]) => void) {
      this.handlers[event]?.push(handler);
    }

    async waitUntilReady() {
      this.handlers.ready.forEach((handler) => handler());
    }

    async handle(job: any) {
      try {
        await this.processor(job);
        const state = getQueueState(this.queueName);
        state.completed += 1;
        this.handlers.completed.forEach((handler) => handler(job));
        queueEventHandlers.get(this.queueName)?.completed.forEach((handler) =>
          handler({ jobId: job.id, jobName: job.name }),
        );
      } catch (error) {
        const state = getQueueState(this.queueName);
        state.failed += 1;
        job.attemptsMade = (job.attemptsMade ?? 0) + 1;
        this.handlers.failed.forEach((handler) => handler(job, error));
        queueEventHandlers.get(this.queueName)?.failed.forEach((handler) =>
          handler({ jobId: job.id, failedReason: error instanceof Error ? error.message : String(error) }),
        );
        throw error;
      }
    }

    async close() {
      workerRegistry.get(this.queueName)?.delete(this);
    }
  }

  return {
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
    Worker: MockWorker,
  };
});

describe('flight plan membership worker integration', () => {
  beforeEach(() => {
    process.env.NEO4J_SYNC_DISABLED = '0';
    process.env.NEO4J_QUEUE_METRICS_INTERVAL_MS = '0';
    queueRegistry.clear();
    workerRegistry.clear();
    queueEventHandlers.clear();
    mockExecuteQuery.mockClear();
    mockPayloadInstance.update.mockClear();
  });

  afterEach(async () => {
    delete process.env.NEO4J_QUEUE_METRICS_INTERVAL_MS;
    delete process.env.NEO4J_QUEUE_DEPTH_WARN;
    delete process.env.NEO4J_FAILURE_RATE_WARN;
    delete process.env.NEO4J_SYNC_DISABLED;
    await (await import('@/src/utils/neo4j')).closeNeo4jDriver();
  });

  it('replays outbox events through BullMQ and projects membership edges to Neo4j', async () => {
    const workerContext = await startFlightPlanMembershipWorker();

    const outboxPayload = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 555,
        ...data,
      })),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
      },
    };

    await enqueueFlightPlanMembershipEvent(outboxPayload as any, {
      membershipId: membership.id,
      flightPlanId: membership.flightPlanId,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      invitedAt: membership.invitedAt,
      respondedAt: membership.respondedAt,
      eventType: 'sync',
    });

    expect(outboxPayload.create).toHaveBeenCalled();
    expect(mockExecuteQuery).toHaveBeenCalled();
    expect(mockPayloadInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plan-membership-events',
        id: 555,
        data: expect.objectContaining({
          processedAt: expect.any(String),
          lockedAt: null,
          lastError: null,
        }),
        overrideAccess: true,
      }),
    );

    await workerContext?.shutdown?.();
  });

  it('records errors on projection failures and leaves outbox state updated', async () => {
    const workerContext = await startFlightPlanMembershipWorker();

    const { listMembershipsForFlightPlan } = await import(
      '@/app/api/_lib/flightPlanMembers'
    );
    (listMembershipsForFlightPlan as any).mockRejectedValueOnce(
      new Error('roster-load-failed'),
    );

    const outboxPayload = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 777,
        ...data,
      })),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
      },
    };

    await enqueueFlightPlanMembershipEvent(outboxPayload as any, {
      membershipId: membership.id,
      flightPlanId: membership.flightPlanId,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      invitedAt: membership.invitedAt,
      respondedAt: membership.respondedAt,
      eventType: 'sync',
    }).catch(() => {
      // worker failure is expected
    });

    expect(mockPayloadInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plan-membership-events',
        id: 777,
        data: expect.objectContaining({
          lastError: expect.stringContaining('roster-load-failed'),
          lockedAt: null,
        }),
        overrideAccess: true,
      }),
    );

    await workerContext?.shutdown?.();
  });
});
