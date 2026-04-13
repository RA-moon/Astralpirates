export const postSlackTextMessage = async ({
  webhookUrl,
  text,
  failOpenNoService404 = false,
  logPrefix,
}) => {
  const slackResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!slackResponse.ok) {
    const slackBody = await slackResponse.text().catch(() => '');
    const normalizedBody = slackBody.trim().toLowerCase();
    if (failOpenNoService404 && slackResponse.status === 404 && normalizedBody.includes('no_service')) {
      console.warn(
        `[${logPrefix}] Slack returned ${slackResponse.status}: ${slackBody || '(no body)'} (ignored: SLACK_FAIL_OPEN=true).`,
      );
      return;
    }
    throw new Error(`Slack returned ${slackResponse.status}: ${slackBody || '(no body)'}`);
  }
};
