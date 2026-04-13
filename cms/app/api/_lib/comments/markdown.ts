import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

type HtmlAttributes = Record<string, unknown>;

const ALLOWED_TAGS = [
  'p',
  'em',
  'strong',
  'a',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'br',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
};

export const MAX_COMMENT_LENGTH = 2000;

const sanitizeAnchorAttrs = (attrs: HtmlAttributes): Record<string, string> => {
  const href = typeof attrs.href === 'string' ? attrs.href.trim() : '';
  if (!href) return {};

  try {
    const url = new URL(href, 'http://localhost');
    const protocol = url.protocol.toLowerCase();
    if (!['http:', 'https:'].includes(protocol)) {
      return {};
    }
  } catch {
    return {};
  }

  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer nofollow',
  };
};

export const normalizeCommentBody = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return trimmed.slice(0, MAX_COMMENT_LENGTH);
  }
  return trimmed;
};

export const renderCommentMarkdown = (raw: string): { raw: string; html: string } => {
  const markdown = normalizeCommentBody(raw);
  if (!markdown) {
    throw new Error('Comment body is required.');
  }

  const rendered = marked.parse(markdown, {
    gfm: true,
    breaks: true,
  });
  const html = typeof rendered === 'string' ? rendered : String(rendered ?? '');

  const sanitized = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    transformTags: {
      a: (_tag: string, attrs: HtmlAttributes) => ({
        tagName: 'a',
        attribs: sanitizeAnchorAttrs(attrs),
      }),
    },
    exclusiveFilter(frame: { tag: string; text: string }) {
      return frame.tag === 'p' && !frame.text.trim();
    },
  });

  return {
    raw: markdown,
    html: sanitized.trim(),
  };
};
