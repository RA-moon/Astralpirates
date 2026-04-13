import type { Field } from 'payload';

export const GALLERY_SLIDE_IMAGE_TYPES = ['upload', 'url'] as const;
type GallerySlideImageType = (typeof GALLERY_SLIDE_IMAGE_TYPES)[number];
export const GALLERY_SLIDE_MEDIA_TYPES = ['image', 'video', 'audio', 'model'] as const;
type GallerySlideMediaType = (typeof GALLERY_SLIDE_MEDIA_TYPES)[number];

const normalizeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return null;
  }
};

export const resolveGallerySlideImageType = (value: unknown): GallerySlideImageType => {
  if (value === 'url') return 'url';
  return 'upload';
};

const validateImageUrl = (value: unknown): true | string => {
  if (typeof value !== 'string' || !value.trim().length) {
    return 'Media URL is required.';
  }
  if (!normalizeHttpsUrl(value)) {
    return 'Enter a valid HTTP(S) media URL.';
  }
  return true;
};

const validateCreditUrl = (value: unknown): true | string => {
  if (value == null || value === '') {
    return true;
  }
  if (typeof value !== 'string') {
    return 'Credit URL must be a full HTTP(S) link.';
  }
  if (!normalizeHttpsUrl(value)) {
    return 'Credit URL must be a full HTTP(S) link.';
  }
  return true;
};

export type BuildGallerySlidesFieldOptions = {
  name: string;
  label: string;
  required?: boolean;
  minRows?: number;
  maxRows?: number;
  description?: string;
  uploadDescription?: string;
  urlDescription?: string;
  defaultImageType?: GallerySlideImageType;
  defaultMediaType?: GallerySlideMediaType;
  descriptionFieldName?: 'description' | 'caption';
};

export const buildGallerySlidesField = ({
  name,
  label,
  required = false,
  minRows,
  maxRows = 8,
  description,
  uploadDescription,
  urlDescription,
  defaultImageType = 'upload',
  defaultMediaType = 'image',
  descriptionFieldName = 'description',
}: BuildGallerySlidesFieldOptions): Field => ({
  name,
  label,
  type: 'array',
  required,
  minRows,
  defaultValue: [],
  maxRows,
  admin: {
    description,
  },
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      admin: {
        description: 'Optional heading shown with the image.',
      },
    },
    {
      name: 'imageAlt',
      label: 'Alt text',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Describe the media for screen readers.',
        rows: 2,
      },
    },
    {
      name: 'imageType',
      type: 'select',
      required: true,
      defaultValue: defaultImageType,
      options: GALLERY_SLIDE_IMAGE_TYPES.map((value) => ({
        label: value === 'upload' ? 'Upload' : 'External URL',
        value,
      })),
      admin: {
        description: 'Use Upload by default. Switch to External URL when needed.',
      },
    },
    {
      name: 'mediaType',
      type: 'select',
      required: true,
      defaultValue: defaultMediaType,
      options: GALLERY_SLIDE_MEDIA_TYPES.map((value) => ({
        label:
          value === 'image'
            ? 'Image'
            : value === 'video'
              ? 'Video'
              : value === 'audio'
                ? 'Audio'
                : '3D model',
        value,
      })),
      admin: {
        description:
          'Media kind controls preview and playback. Uploads are auto-detected but can be overridden.',
      },
    },
    {
      name: 'galleryImage',
      label: 'Uploaded file',
      type: 'relationship',
      relationTo: 'gallery-images',
      admin: {
        description: uploadDescription ?? 'Upload or select a file stored within Payload.',
        condition: (_, siblingData) => resolveGallerySlideImageType(siblingData?.imageType) === 'upload',
      },
      validate: (value: unknown, { siblingData }: { siblingData?: Record<string, unknown> }) => {
        if (resolveGallerySlideImageType(siblingData?.imageType) === 'url') {
          return true;
        }
        if (!value) {
          return 'Upload is required.';
        }
        return true;
      },
    },
    {
      name: 'imageUrl',
      label: 'Media URL',
      type: 'text',
      required: false,
      admin: {
        description: urlDescription ?? 'Full HTTP(S) media URL.',
        condition: (_, siblingData) => resolveGallerySlideImageType(siblingData?.imageType) === 'url',
      },
      validate: (value: unknown, { siblingData }: { siblingData?: Record<string, unknown> }) => {
        if (resolveGallerySlideImageType(siblingData?.imageType) === 'upload') {
          return true;
        }
        return validateImageUrl(value);
      },
    },
    {
      name: 'label',
      type: 'text',
      label: 'Slide label',
      admin: {
        description: 'Optional short tag shown in navigation dots.',
      },
    },
    {
      name: descriptionFieldName,
      label: 'Description',
      type: 'textarea',
      admin: {
        rows: 2,
      },
    },
    {
      name: 'creditLabel',
      label: 'Credit label',
      type: 'text',
    },
    {
      name: 'creditUrl',
      label: 'Credit URL',
      type: 'text',
      validate: validateCreditUrl,
    },
  ],
});
