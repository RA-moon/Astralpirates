import {
  asNonNegativeInt,
  decodeSafe,
  normalizeFilename,
  trim,
} from './avatar-route-utils.mjs';

const applyNumericOption = ({ options, flag, rawValue, numericOptions }) => {
  const spec = numericOptions[flag];
  const parsed = asNonNegativeInt(rawValue, spec.fallback);
  options[spec.key] = spec.coerceZeroToFallback && parsed === 0 ? spec.fallback : parsed;
};

export const parseAvatarRouteProbeArgs = ({
  argv,
  defaults,
  usage,
  numericOptions = {},
}) => {
  const options = {
    ...defaults,
    filenames: Array.isArray(defaults.filenames) ? [...defaults.filenames] : [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--base' && typeof next === 'string') {
      options.base = next;
      index += 1;
      continue;
    }
    if (arg === '--crew-url' && typeof next === 'string') {
      options.crewUrl = next;
      index += 1;
      continue;
    }
    if (arg === '--filename' && typeof next === 'string') {
      const normalized = normalizeFilename(decodeSafe(next));
      if (!normalized) {
        throw new Error('--filename must not be empty.');
      }
      options.filenames.push(normalized);
      index += 1;
      continue;
    }
    if (arg === '--internal-host' && typeof next === 'string') {
      options.internalHost = trim(next).toLowerCase();
      index += 1;
      continue;
    }
    if (arg in numericOptions && typeof next === 'string') {
      applyNumericOption({ options, flag: arg, rawValue: next, numericOptions });
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const baseUrl = new URL(options.base);
  const crewUrl = options.crewUrl
    ? new URL(options.crewUrl, baseUrl)
    : new URL('/api/crew?limit=500', baseUrl);
  const internalHost = options.internalHost || baseUrl.hostname.toLowerCase();

  return {
    ...options,
    baseUrl,
    crewUrl,
    internalHost,
  };
};
