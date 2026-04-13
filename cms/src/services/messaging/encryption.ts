import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import sodium from 'libsodium-wrappers';

export const MASTER_KEY_BYTES = 32;
export const THREAD_KEY_BYTES = 32;
export const AES_GCM_NONCE_BYTES = 12;

const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

let sodiumReady: Promise<typeof sodium> | null = null;
let cachedMasterKey: Buffer | null = null;

const getSodium = async (): Promise<typeof sodium> => {
  if (!sodiumReady) {
    sodiumReady = sodium.ready.then(() => sodium);
  }
  return sodiumReady;
};

const normalizeBuffer = (value: Buffer | Uint8Array | string): Buffer => {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.from(value);
};

const resolveMasterKey = (override?: Buffer | string | Uint8Array): Buffer => {
  if (override) {
    const buffer = normalizeBuffer(override);
    if (buffer.length !== MASTER_KEY_BYTES) {
      throw new Error(
        `[messaging] Master key override must be ${MASTER_KEY_BYTES} bytes (received ${buffer.length}).`,
      );
    }
    return buffer;
  }

  if (cachedMasterKey) {
    return cachedMasterKey;
  }

  const hex = process.env.MESSAGING_MASTER_KEY?.trim();
  if (!hex || !HEX_KEY_REGEX.test(hex)) {
    throw new Error(
      '[messaging] MESSAGING_MASTER_KEY must be a 32-byte hex string (64 characters).',
    );
  }
  cachedMasterKey = Buffer.from(hex, 'hex');
  return cachedMasterKey;
};

const aesGcmEncrypt = ({
  plaintext,
  key,
  additionalData,
}: {
  plaintext: Buffer;
  key: Buffer;
  additionalData?: Buffer;
}) => {
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error('[messaging] AES-GCM key must be 32 bytes.');
  }
  const iv = randomBytes(AES_GCM_NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (additionalData) {
    cipher.setAAD(additionalData);
  }
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, nonce: iv, authTag };
};

const aesGcmDecrypt = ({
  ciphertext,
  nonce,
  authTag,
  key,
  additionalData,
}: {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  key: Buffer;
  additionalData?: Buffer;
}) => {
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error('[messaging] AES-GCM key must be 32 bytes.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  if (additionalData) {
    decipher.setAAD(additionalData);
  }
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

export const generateThreadKey = (): Buffer => randomBytes(THREAD_KEY_BYTES);

export type EncryptedBodyPayload = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  preview: string;
};

const buildPreview = (value: string, limit = 120): string => {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, limit - 1)}…`;
};

export const encryptMessageBody = ({
  body,
  key,
  additionalData,
}: {
  body: string;
  key: Buffer;
  additionalData?: Buffer;
}): EncryptedBodyPayload => {
  const plaintext = Buffer.from(body, 'utf8');
  const { ciphertext, nonce, authTag } = aesGcmEncrypt({
    plaintext,
    key,
    additionalData,
  });
  return {
    ciphertext,
    nonce,
    authTag,
    preview: buildPreview(body),
  };
};

export const decryptMessageBody = ({
  ciphertext,
  nonce,
  authTag,
  key,
  additionalData,
}: {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  key: Buffer;
  additionalData?: Buffer;
}): string => {
  const plaintext = aesGcmDecrypt({
    ciphertext,
    nonce,
    authTag,
    key,
    additionalData,
  });
  return plaintext.toString('utf8');
};

export const encryptThreadKey = ({
  threadKey,
  masterKeyOverride,
  additionalData,
}: {
  threadKey: Buffer;
  masterKeyOverride?: Buffer | string | Uint8Array;
  additionalData?: Buffer;
}) =>
  aesGcmEncrypt({
    plaintext: threadKey,
    key: resolveMasterKey(masterKeyOverride),
    additionalData,
  });

export const decryptThreadKey = ({
  ciphertext,
  nonce,
  authTag,
  masterKeyOverride,
  additionalData,
}: {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  masterKeyOverride?: Buffer | string | Uint8Array;
  additionalData?: Buffer;
}): Buffer =>
  aesGcmDecrypt({
    ciphertext,
    nonce,
    authTag,
    key: resolveMasterKey(masterKeyOverride),
    additionalData,
  });

export type UserKeyPair = {
  publicKey: Buffer;
  privateKey: Buffer;
};

export const generateUserKeyPair = async (): Promise<UserKeyPair> => {
  const lib = await getSodium();
  const { publicKey, privateKey } = lib.crypto_box_keypair();
  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(privateKey),
  };
};

const encodeSecretbox = (payload: Uint8Array): Buffer => Buffer.from(payload);
const decodeSecretbox = (payload: Buffer | Uint8Array): Uint8Array =>
  payload instanceof Uint8Array ? payload : new Uint8Array(payload);

export const sealPrivateKey = async ({
  privateKey,
  masterKeyOverride,
}: {
  privateKey: Buffer | Uint8Array;
  masterKeyOverride?: Buffer | string | Uint8Array;
}): Promise<Buffer> => {
  const lib = await getSodium();
  const key = new Uint8Array(resolveMasterKey(masterKeyOverride));
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error('[messaging] Master key must be 32 bytes.');
  }
  const nonce = lib.randombytes_buf(lib.crypto_secretbox_NONCEBYTES);
  const cipher = lib.crypto_secretbox_easy(
    new Uint8Array(privateKey),
    nonce,
    key,
  );
  return Buffer.concat([encodeSecretbox(nonce), encodeSecretbox(cipher)]);
};

export const unsealPrivateKey = async ({
  sealed,
  masterKeyOverride,
}: {
  sealed: Buffer | Uint8Array;
  masterKeyOverride?: Buffer | string | Uint8Array;
}): Promise<Buffer> => {
  const lib = await getSodium();
  const key = new Uint8Array(resolveMasterKey(masterKeyOverride));
  const input = normalizeBuffer(sealed);
  const nonceLength = lib.crypto_secretbox_NONCEBYTES;
  if (input.length <= nonceLength) {
    throw new Error('[messaging] Sealed private key payload is malformed.');
  }

  const nonce = decodeSecretbox(input.subarray(0, nonceLength));
  const ciphertext = decodeSecretbox(input.subarray(nonceLength));
  const opened = lib.crypto_secretbox_open_easy(ciphertext, nonce, key);
  if (!opened) {
    throw new Error('[messaging] Failed to unseal private key payload.');
  }

  return Buffer.from(opened);
};

export const resetCachedMasterKey = (): void => {
  cachedMasterKey = null;
};
