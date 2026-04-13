import { pathToFileURL } from 'node:url';

export const isDirectExecution = (
  moduleUrl: string,
  argv: readonly string[] = process.argv,
): boolean => {
  if (!moduleUrl) return false;
  const executedPath = argv[1];
  if (!executedPath) return false;
  return pathToFileURL(executedPath).href === moduleUrl;
};
