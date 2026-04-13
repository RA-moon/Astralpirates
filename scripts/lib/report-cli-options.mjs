export const parseBooleanEnvFlag = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const hasPrefixedFlagValue = (arg, flags) => {
  for (const flag of Object.keys(flags)) {
    if (arg.startsWith(`${flag}=`)) {
      return true;
    }
  }
  return false;
};

export const applyReportCliArgs = ({
  argv,
  options,
  valueFlags,
  booleanFlags = {},
  repeatableValueFlags = {},
  strictUnknown = false,
}) => {
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      helpRequested = true;
      continue;
    }

    let handled = false;

    const booleanKey = booleanFlags[arg];
    if (booleanKey) {
      options[booleanKey] = true;
      handled = true;
      continue;
    }

    const repeatableKey = repeatableValueFlags[arg];
    if (repeatableKey) {
      const value = argv[index + 1];
      if (!Array.isArray(options[repeatableKey])) {
        options[repeatableKey] = [];
      }
      options[repeatableKey].push(value);
      index += 1;
      handled = true;
      continue;
    }

    const directKey = valueFlags[arg];
    if (directKey) {
      options[directKey] = argv[index + 1];
      index += 1;
      handled = true;
      continue;
    }

    for (const [flag, key] of Object.entries(valueFlags)) {
      const prefix = `${flag}=`;
      if (!arg.startsWith(prefix)) continue;
      options[key] = arg.slice(prefix.length);
      handled = true;
      break;
    }
    if (handled) continue;

    for (const [flag, key] of Object.entries(repeatableValueFlags)) {
      const prefix = `${flag}=`;
      if (!arg.startsWith(prefix)) continue;
      if (!Array.isArray(options[key])) {
        options[key] = [];
      }
      options[key].push(arg.slice(prefix.length));
      handled = true;
      break;
    }
    if (handled) continue;

    if (strictUnknown && arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { helpRequested };
};

export const findFirstPositionalArg = ({
  argv,
  valueFlags = {},
  booleanFlags = {},
  repeatableValueFlags = {},
}) => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      continue;
    }
    if (booleanFlags[arg]) {
      continue;
    }
    if (valueFlags[arg] || repeatableValueFlags[arg]) {
      index += 1;
      continue;
    }
    if (hasPrefixedFlagValue(arg, valueFlags) || hasPrefixedFlagValue(arg, repeatableValueFlags)) {
      continue;
    }
    if (arg.startsWith('--')) {
      continue;
    }

    return arg;
  }

  return '';
};
