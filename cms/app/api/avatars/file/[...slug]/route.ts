import {
  createMediaMethodHandlers,
} from '../../../_lib/mediaFileRoute';
import { handleAvatarRequest } from '../_lib/avatarFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleAvatarRequest);
export { GET, HEAD };
