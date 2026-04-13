import { createMediaMethodHandlers } from '../../../api/_lib/mediaFileRoute';
import { handleTaskAttachmentRequest } from '../../../api/task-attachments/file/_lib/taskAttachmentFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleTaskAttachmentRequest);
export { GET, HEAD };
