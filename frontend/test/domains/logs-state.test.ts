import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useFlightPlans, useLogbook } from '~/domains/logs';

const executeMock = vi.fn();
let lastRequest = '';

vi.mock('~/modules/api', () => ({
  useAstralFetch: (request: () => string, options: { default: () => unknown }) => ({
    data: ref(options.default()),
    pending: ref(false),
    error: ref(null),
    execute: () => {
      lastRequest = request();
      executeMock();
      return Promise.resolve();
    },
  }),
}));

describe('useFlightPlans filters', () => {
  beforeEach(() => {
    executeMock.mockReset();
    lastRequest = '';
  });

  it('includes category, status, and bucket query filters', async () => {
    const categories = ref<string[]>(['event']);
    const statuses = ref<string[]>(['ongoing']);
    const bucket = ref<string | null>('finished');

    useFlightPlans({
      categories,
      statuses,
      bucket,
      limit: ref(12),
      ownerSlug: () => null,
      memberSlug: () => null,
    });

    await nextTick();

    expect(executeMock).toHaveBeenCalled();
    const [path, rawQuery] = lastRequest.split('?');
    expect(path).toBe('/api/flight-plans');

    const query = new URLSearchParams(rawQuery);
    expect(query.getAll('category')).toEqual(['event']);
    expect(query.getAll('status')).toEqual(['ongoing']);
    expect(query.get('bucket')).toBe('finished');
    expect(query.get('limit')).toBe('12');
  });

  it('does not include log-only role/owner filters in flight-plan queries', async () => {
    useFlightPlans({
      limit: ref(5),
      ownerSlug: () => null,
      memberSlug: () => null,
      roles: ref(['captain']),
      owners: ref(['ramun']),
    } as any);

    await nextTick();

    const [, rawQuery = ''] = lastRequest.split('?');
    const query = new URLSearchParams(rawQuery);
    expect(query.getAll('role')).toEqual([]);
    expect(query.getAll('owner')).toEqual([]);
    expect(query.get('limit')).toBe('5');
  });

  it('does not include flight-plan-only filters in log queries', async () => {
    useLogbook({
      limit: ref(7),
      ownerSlug: () => null,
      memberSlug: () => 'crew-one',
      categories: ref(['event']),
      statuses: ref(['ongoing']),
      bucket: ref('active'),
    } as any);

    await nextTick();

    const [, rawQuery = ''] = lastRequest.split('?');
    const query = new URLSearchParams(rawQuery);
    expect(query.get('memberSlug')).toBeNull();
    expect(query.getAll('category')).toEqual([]);
    expect(query.getAll('status')).toEqual([]);
    expect(query.get('bucket')).toBeNull();
    expect(query.get('limit')).toBe('7');
  });
});
