import { createMediaMethodHandlers } from '../../../_lib/mediaFileRoute';
import { handleTaskAttachmentRequest } from '../_lib/taskAttachmentFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleTaskAttachmentRequest);
export { GET, HEAD };
