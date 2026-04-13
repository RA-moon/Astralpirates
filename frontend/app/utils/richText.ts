import type {
  Link,
  RichTextContent,
  RichTextNode,
  RichTextTextNode,
} from '~/modules/api/schemas';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const rewriteLegacyFlightPlanPath = (pathname: string): string => {
  if (!/^\/+flight-plans/i.test(pathname)) {
    return pathname;
  }
  return pathname.replace(/^\/+flight-plans(?:\/events)?/i, '/bridge/flight-plans');
};

const rewriteRelativeLegacyFlightPlanHref = (href: string): string => {
  const match = href.match(/^(\/[^?#]*)(.*)$/);
  if (!match) {
    return href;
  }
  const [, path = '', suffix = ''] = match;
  if (!/^\/+flight-plans/i.test(path)) {
    return href;
  }
  const updated = rewriteLegacyFlightPlanPath(path);
  if (updated === path) {
    return href;
  }
  return `${updated}${suffix}`;
};

const isAstralPiratesHostname = (hostname: string): boolean =>
  hostname === 'astralpirates.com' || hostname.endsWith('.astralpirates.com');

const rewriteAbsoluteLegacyFlightPlanHref = (href: string): string => {
  try {
    const url = new URL(href);
    if (!url.hostname || !isAstralPiratesHostname(url.hostname)) {
      return href;
    }
    const updatedPath = rewriteLegacyFlightPlanPath(url.pathname);
    if (updatedPath === url.pathname) {
      return href;
    }
    url.pathname = updatedPath;
    return url.toString();
  } catch {
    return href;
  }
};

const normalizeRichTextHref = (href: string | null | undefined): string => {
  if (typeof href !== 'string') {
    return '#';
  }
  const trimmed = href.trim();
  if (!trimmed) {
    return '#';
  }
  if (trimmed.startsWith('/')) {
    return rewriteRelativeLegacyFlightPlanHref(trimmed);
  }
  if (trimmed.startsWith('//')) {
    const rewritten = rewriteAbsoluteLegacyFlightPlanHref(`https:${trimmed}`);
    return rewritten === `https:${trimmed}` ? trimmed : rewritten.replace(/^https:/, '');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return rewriteAbsoluteLegacyFlightPlanHref(trimmed);
  }
  return trimmed;
};

const renderTextNode = (node: RichTextTextNode): string => {
  let content = escapeHtml(node.text);
  if (node.bold) {
    content = `<strong>${content}</strong>`;
  }
  if (node.italic) {
    content = `<em>${content}</em>`;
  }
  if (node.underline) {
    content = `<u>${content}</u>`;
  }
  if (node.strikethrough) {
    content = `<s>${content}</s>`;
  }
  return content;
};

const renderNode = (node: RichTextNode | RichTextTextNode): string => {
  if ('text' in node) {
    return renderTextNode(node);
  }

  const children = (node.children ?? []).map((child) => renderNode(child)).join('');

  switch (node.type) {
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'ul':
      return `<ul>${children}</ul>`;
    case 'ol':
      return `<ol>${children}</ol>`;
    case 'li':
      return `<li>${children}</li>`;
    case 'columns':
      return `<div class="rich-text__columns">${children}</div>`;
    case 'column':
      return `<div class="rich-text__column">${children}</div>`;
    case 'h2':
    case 'h3':
    case 'h4':
      return `<${node.type}>${children}</${node.type}>`;
    case 'link':
      return `<a href="${escapeHtml(normalizeRichTextHref(node.url))}"${
        node.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
      }>${children}</a>`;
    default:
      return children;
  }
};

export const renderRichText = (content: RichTextContent | null | undefined): string => {
  if (!content || content.length === 0) return '';
  return content.map((node) => renderNode(node)).join('');
};

const collectText = (node: RichTextNode | RichTextTextNode, acc: string[]): void => {
  if ('text' in node) {
    acc.push(node.text);
    return;
  }
  node.children?.forEach((child) => collectText(child, acc));
};

export const richTextToPlainText = (content: RichTextContent | null | undefined): string => {
  if (!content || content.length === 0) return '';
  const parts: string[] = [];
  content.forEach((node) => collectText(node, parts));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const nodeToEditableString = (node: RichTextNode | RichTextTextNode): string => {
  if ('text' in node) {
    return node.text;
  }

  if (node.type === 'ul' || node.type === 'ol') {
    const items = (node.children ?? []).map((child, index) => {
      const content = nodeToEditableString(child).trim();
      if (!content) return null;
      if (node.type === 'ul') {
        return `- ${content}`;
      }
      return `${index + 1}. ${content}`;
    });
    return items.filter(Boolean).join('\n');
  }

  if (node.type === 'li') {
    const parts: string[] = [];
    node.children?.forEach((child) => {
      const content = nodeToEditableString(child).trim();
      if (content) {
        parts.push(content);
      }
    });
    return parts.join(' ');
  }

  const childContent = (node.children ?? [])
    .map((child) => nodeToEditableString(child))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return childContent;
};

export const richTextToEditorString = (content: RichTextContent | null | undefined): string => {
  if (!content || content.length === 0) return '';
  const segments: string[] = [];
  content.forEach((node) => {
    const value = nodeToEditableString(node).trim();
    if (value) {
      segments.push(value);
    }
  });
  return segments.join('\n\n');
};

const toParagraphNode = (text: string): RichTextNode => ({
  type: 'paragraph',
  children: [{ text }],
});

const toListNode = (type: 'ul' | 'ol', lines: string[]): RichTextNode | null => {
  const items = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const value =
        type === 'ul'
          ? trimmed.replace(/^[-*]\s*/, '').trim()
          : trimmed.replace(/^\d+\.\s*/, '').trim();
      if (!value) return null;
      return {
        type: 'li',
        children: [{ text: value }],
      } satisfies RichTextNode;
    })
    .filter(Boolean) as RichTextNode[];

  if (!items.length) return null;

  return {
    type,
    children: items,
  };
};

export const editorStringToRichText = (value: string): RichTextContent => {
  if (!value || !value.trim()) return [];

  const segments = value
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const nodes: RichTextContent = [];

  segments.forEach((segment) => {
    const lines = segment.split('\n').map((line) => line.trim());
    const bulletList = lines.every((line) => /^[-*]\s+/.test(line));
    const orderedList = !bulletList && lines.every((line) => /^\d+\.\s+/.test(line));

    if (bulletList || orderedList) {
      const listNode = toListNode(bulletList ? 'ul' : 'ol', lines);
      if (listNode) {
        nodes.push(listNode);
      }
      return;
    }

    const text = lines.join(' ').replace(/\s+/g, ' ').trim();
    nodes.push(toParagraphNode(text));
  });

  return nodes;
};

export const resolveCtaAttributes = (cta: Link) => {
  const isExternal =
    /^https?:\/\//.test(cta.href) ||
    cta.href.startsWith('//') ||
    cta.href.startsWith('mailto:') ||
    cta.href.startsWith('tel:');

  const variant =
    cta.style === 'secondary'
      ? 'secondary'
      : cta.style === 'link'
        ? 'ghost'
        : 'primary';

  return {
    variant,
    isExternal,
  };
};
