import {
  createMediaMethodHandlers,
} from '../../../api/_lib/mediaFileRoute';
import { handleAvatarRequest } from '../../../api/avatars/file/_lib/avatarFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleAvatarRequest);
export { GET, HEAD };
