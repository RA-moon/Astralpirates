export const trim = (value) => (typeof value === 'string' ? value.trim() : '');

export const asNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const decodeSafe = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const normalizeFilename = (value) =>
  trim(value)
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

export const encodePathSegments = (value) =>
  normalizeFilename(value)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

export const extractAvatarFilenameFromUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';

  let parsed;
  if (/^https?:\/\//i.test(raw)) {
    try {
      parsed = new URL(raw);
    } catch {
      return '';
    }
  }

  const pathname = parsed ? parsed.pathname : raw;
  const prefixes = ['/api/avatars/file/', '/media/avatars/', '/avatars/'];
  for (const prefix of prefixes) {
    const index = pathname.indexOf(prefix);
    if (index === -1) continue;
    const relative = normalizeFilename(pathname.slice(index + prefix.length));
    if (!relative) continue;
    return decodeSafe(relative);
  }

  return '';
};

export const isInternalAvatarUrl = ({ value, internalHost }) => {
  const raw = trim(value);
  if (!raw) return false;
  if (!/^https?:\/\//i.test(raw)) return raw.startsWith('/');

  try {
    const parsed = new URL(raw);
    return parsed.hostname.toLowerCase() === internalHost;
  } catch {
    return false;
  }
};

export const isImageContentType = (value) => trim(value).toLowerCase().startsWith('image/');

export const fetchWithTimeout = async (url, init = {}, timeoutMs, userAgent) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
};

export const resolveAvatarRouteTargets = async ({
  crewUrl,
  timeoutMs,
  internalHost,
  extraFilenames = [],
  userAgent,
}) => {
  const crewResponse = await fetchWithTimeout(
    String(crewUrl),
    {},
    timeoutMs,
    userAgent,
  );
  if (!crewResponse.ok) {
    throw new Error(`Crew API request failed (${crewResponse.status})`);
  }

  const crewPayload = await crewResponse.json();
  if (!crewPayload || !Array.isArray(crewPayload.members)) {
    throw new Error('Unexpected crew payload: expected members[]');
  }

  const filenames = new Set();
  for (const member of crewPayload.members) {
    const avatarUrl = trim(member?.avatarUrl);
    if (!avatarUrl) continue;
    if (!isInternalAvatarUrl({ value: avatarUrl, internalHost })) {
      continue;
    }
    const filename = extractAvatarFilenameFromUrl(avatarUrl);
    if (!filename) continue;
    filenames.add(filename);
  }

  for (const filename of extraFilenames) {
    const normalized = normalizeFilename(filename);
    if (!normalized) continue;
    filenames.add(normalized);
  }

  return Array.from(filenames).sort((left, right) => left.localeCompare(right));
};

export const probeImageRoute = async ({
  url,
  timeoutMs,
  userAgent,
}) => {
  try {
    const headResponse = await fetchWithTimeout(
      url,
      {
        method: 'HEAD',
      },
      timeoutMs,
      userAgent,
    );

    const headType = trim(headResponse.headers.get('content-type')) || null;
    if (headResponse.status !== 405 && headResponse.status !== 501) {
      return {
        status: headResponse.status,
        contentType: headType,
        isImage: isImageContentType(headType),
        error: null,
      };
    }

    const getResponse = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Range: 'bytes=0-0',
        },
      },
      timeoutMs,
      userAgent,
    );

    const getType = trim(getResponse.headers.get('content-type')) || null;
    return {
      status: getResponse.status,
      contentType: getType,
      isImage: isImageContentType(getType),
      error: null,
    };
  } catch (error) {
    return {
      status: 0,
      contentType: null,
      isImage: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
