import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import {
  upsertInviteEdge,
  removeInviteEdgesForUser,
  closeNeo4jDriver,
  isNeo4jSyncDisabled,
} from '../utils/neo4j';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const syncInvites = async () => {
  if (isNeo4jSyncDisabled()) {
    console.log('Neo4j sync disabled; skipping invite sync.');
    return;
  }

  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child({ script: 'sync-invites-to-neo4j' }) ?? console;

  try {
    const pageSize = 100;
    let page = 1;
    let processed = 0;
    let synced = 0;
    let cleared = 0;

    logger.info?.({ pageSize }, 'Starting invite sync');
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await instance.find({
        collection: 'users',
        limit: pageSize,
        page,
        depth: 0,
        overrideAccess: true,
      });

      for (const doc of result.docs) {
        processed += 1;
        const inviter = doc.invitedBy;
        if (!inviter) {
          await removeInviteEdgesForUser(doc.id);
          cleared += 1;
          continue;
        }

        const inviterId =
          typeof inviter === 'object' && inviter !== null
            ? 'id' in inviter
              ? inviter.id
              : null
            : inviter;

        if (!inviterId) {
          await removeInviteEdgesForUser(doc.id);
          cleared += 1;
          continue;
        }

        await upsertInviteEdge({ inviterId, inviteeId: doc.id });
        synced += 1;
      }

      logger.info?.(
        { page, pageSize, batchSize: result.docs.length, processed, synced, cleared },
        'Processed invite batch',
      );

      if (result.docs.length < pageSize) break;
      page += 1;
    }
    logger.info?.({ processed, synced, cleared }, 'Invite sync complete');
  } finally {
    await closePayloadLifecycle(instance);
    await closeNeo4jDriver();
  }
};

syncInvites().catch((error) => {
  console.error('[neo4j] failed to sync invite relationships');
  console.error(error);
  process.exitCode = 1;
});
