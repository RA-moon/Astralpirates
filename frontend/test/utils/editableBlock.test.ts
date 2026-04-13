import { describe, expect, it, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { createEditableBlock } from '~/utils/editableBlock';

type SampleBlock = { title: string; count: number };

const fallback: SampleBlock = { title: 'Fallback', count: 1 };

const normalise = (value: any): SampleBlock => ({
  title: typeof value?.title === 'string' ? value.title : fallback.title,
  count: Number.isFinite(value?.count) ? value.count : fallback.count,
});

describe('createEditableBlock', () => {
  let block: ReturnType<typeof createEditableBlock<SampleBlock>>;

  beforeEach(() => {
    block = createEditableBlock(fallback, normalise);
  });

  it('initialises with fallback data and no errors', () => {
    expect(block.data).toEqual(fallback);
    expect(block.error).toBe('');
  });

  it('parses valid JSON and updates data reactively', async () => {
    block.source.value = JSON.stringify({ title: 'Updated', count: 5 });
    await nextTick();
    expect(block.data).toEqual({ title: 'Updated', count: 5 });
    expect(block.error).toBe('');
  });

  it('resets data and exposes error state when JSON parsing fails', async () => {
    block.source.value = '{ "title": "broken"'; // invalid json
    await nextTick();
    expect(block.data).toEqual(fallback);
    expect(block.error.length).toBeGreaterThan(0);
  });

  it('reset() restores the fallback source string', async () => {
    block.source.value = JSON.stringify({ title: 'Draft', count: 7 });
    await nextTick();
    block.reset();
    await nextTick();
    expect(block.data).toEqual(fallback);
    expect(block.source.value).toBe(JSON.stringify(fallback, null, 2));
  });
});
