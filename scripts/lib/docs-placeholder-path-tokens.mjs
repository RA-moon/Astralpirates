export const PLACEHOLDER_PATH_TOKEN_RE = /\bdocs\/(?:run-logs\/)?\.\.\.[A-Za-z0-9_./-]*/g;

export function findPlaceholderPathTokens(contents) {
  const text = typeof contents === 'string' ? contents : '';
  const matches = [];
  let match;
  while ((match = PLACEHOLDER_PATH_TOKEN_RE.exec(text)) !== null) {
    matches.push({
      token: match[0],
      index: match.index,
    });
  }
  return matches;
}
