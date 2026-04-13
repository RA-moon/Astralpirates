import { createMediaMethodHandlers } from '../../../_lib/mediaFileRoute';
import { handleHonorBadgeMediaRequest } from '../_lib/honorBadgeFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleHonorBadgeMediaRequest);
export { GET, HEAD };
