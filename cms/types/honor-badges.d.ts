import type { HonorBadgeRecord } from '@astralpirates/shared/honorBadges';

declare module '@/payload-types' {
  interface User {
    honorBadges?: HonorBadgeRecord[] | null;
  }
}
