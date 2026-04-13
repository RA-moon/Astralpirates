import { sanitizePageBlocks } from '@astralpirates/shared/pageBlocks';
import type { PageBlock } from '@astralpirates/shared/api-contracts';

type AnyBlock = Record<string, unknown> & { blockType?: string };

export const sanitiseLayout = (layout: AnyBlock[] | undefined): AnyBlock[] | undefined => {
  if (!Array.isArray(layout)) return layout;
  return sanitizePageBlocks(layout as PageBlock[]);
};

export const sanitisePageData = <T extends Record<string, unknown>>(data: T): T => {
  if (!data || typeof data !== 'object') return data;
  if ('layout' in data) {
    (data as Record<string, unknown>).layout = sanitiseLayout(
      (data as Record<string, unknown>).layout as AnyBlock[] | undefined,
    ) as any;
  }
  return data;
};
