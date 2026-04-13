export const fetchShipStatusMetrics = async ({
  baseUrl,
  metricsPath,
  userAgent,
  queryParams = {},
  notFoundMessage,
}) => {
  const metricsUrl = new URL(metricsPath, baseUrl);
  for (const [key, value] of Object.entries(queryParams)) {
    if (typeof value === 'string' && value) {
      metricsUrl.searchParams.set(key, value);
    }
  }

  const response = await fetch(metricsUrl.toString(), {
    headers: {
      'user-agent': userAgent,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 404 && typeof notFoundMessage === 'function') {
      throw new Error(notFoundMessage({ metricsUrl: metricsUrl.toString(), response, body }));
    }
    throw new Error(`Metrics returned ${response.status}: ${body || '(no body)'}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok !== true) {
    throw new Error(
      `Unexpected metrics payload: ${payload ? JSON.stringify(payload) : 'unparseable response'}`,
    );
  }

  return payload;
};
