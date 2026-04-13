import { createMediaMethodHandlers } from '../../../_lib/mediaFileRoute';
import { handleGalleryRequest } from '../_lib/galleryFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleGalleryRequest);
export { GET, HEAD };
