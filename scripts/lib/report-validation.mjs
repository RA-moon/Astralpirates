export const getCommonReportOptionError = ({
  baseUrl,
  metricsPath,
  dryRun,
  slackWebhook,
}) => {
  if (!baseUrl) {
    return 'Missing base URL.';
  }

  if (!metricsPath) {
    return 'Missing metrics path.';
  }

  if (!dryRun && !slackWebhook) {
    return 'Missing Slack webhook. Set SLACK_WEBHOOK or pass --slack-webhook.';
  }

  return null;
};
