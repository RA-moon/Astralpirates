import { beforeEach, describe, expect, it } from 'vitest';

import {
  decryptMessageBody,
  encryptMessageBody,
  generateThreadKey,
  generateUserKeyPair,
  resetCachedMasterKey,
  sealPrivateKey,
  unsealPrivateKey,
} from './encryption';

const TEST_MASTER_KEY = '0'.repeat(64);

describe('messaging encryption helpers', () => {
  beforeEach(() => {
    process.env.MESSAGING_MASTER_KEY = TEST_MASTER_KEY;
    resetCachedMasterKey();
  });

  it('seals and re-opens private keys with the master key', async () => {
    const { privateKey } = await generateUserKeyPair();
    const sealed = await sealPrivateKey({ privateKey });
    expect(sealed.length).toBeGreaterThan(0);

    const opened = await unsealPrivateKey({ sealed });
    expect(Buffer.compare(opened, privateKey)).toBe(0);
  });

  it('encrypts and decrypts message bodies with previews', () => {
    const threadKey = generateThreadKey();
    const body =
      'Standby for docking maneuvers. This message should reappear exactly after decrypting.';

    const encrypted = encryptMessageBody({ body, key: threadKey });
    expect(encrypted.preview.startsWith('Standby for docking maneuvers.')).toBe(true);

    const decrypted = decryptMessageBody({
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      key: threadKey,
    });
    expect(decrypted).toBe(body);
  });
});
