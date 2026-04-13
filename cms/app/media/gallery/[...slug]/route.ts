import { createMediaMethodHandlers } from '../../../api/_lib/mediaFileRoute';
import { handleGalleryRequest } from '../../../api/gallery-images/file/_lib/galleryFileHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { GET, HEAD } = createMediaMethodHandlers(handleGalleryRequest);
export { GET, HEAD };
