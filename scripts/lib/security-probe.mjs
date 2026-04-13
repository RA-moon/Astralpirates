const toMessage = (error) => (error instanceof Error ? error.message : String(error));

export const createSecurityProbeCollector = () => {
  const failures = [];
  const warnings = [];

  return {
    failures,
    warnings,
    addFailure(message) {
      failures.push(message);
    },
    addWarning(message) {
      warnings.push(message);
    },
  };
};

export const formatProbeRequestError = ({ name, url, error }) =>
  `[${name}] request failed for ${url}: ${toMessage(error)}`;

export const printSecurityProbeSummary = ({
  scriptName,
  collector,
  warnOnly = false,
  successMessage,
}) => {
  if (collector.warnings.length) {
    console.warn(`[${scriptName}] Warnings:`);
    collector.warnings.forEach((message) => console.warn(`- ${message}`));
  }

  if (collector.failures.length) {
    console.error(`[${scriptName}] Failures:`);
    collector.failures.forEach((message) => console.error(`- ${message}`));
    if (warnOnly) {
      console.warn(`[${scriptName}] warn-only mode enabled; exiting without failure.`);
      return { ok: true, warnOnlyTriggered: true };
    }
    return { ok: false, warnOnlyTriggered: false };
  }

  if (successMessage) {
    console.log(successMessage);
  }
  return { ok: true, warnOnlyTriggered: false };
};

