type ActivityPayload = {
  update: (args: {
    collection: 'users';
    id: number | string;
    data: { lastActiveAt: string };
    overrideAccess: true;
  }) => Promise<unknown>;
  logger?: {
    warn?: (meta: { err: unknown; userId: number | string }, message: string) => void;
  };
};

export const touchUserActivity = async (
  payload: ActivityPayload,
  userId: number | string,
  context: string,
) => {
  try {
    await payload.update({
      collection: 'users',
      id: userId,
      data: {
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    });
  } catch (error) {
    payload.logger?.warn?.({ err: error, userId }, `Failed to stamp user activity after ${context}`);
  }
};
