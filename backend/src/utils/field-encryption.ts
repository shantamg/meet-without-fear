/**
 * Field-Level Encryption Utility
 *
 * AES-256-GCM encryption for sensitive database fields. Addresses audit finding H5:
 * "No application-level encryption — trauma descriptions, emotional venting,
 * relationship conflicts in plaintext."
 *
 * Encrypted format: `enc:v1:<iv>:<authTag>:<ciphertext>` (all segments base64-encoded)
 *
 * Configuration:
 *   FIELD_ENCRYPTION_KEY — 32-byte key, base64-encoded.
 *   If not set, encrypt/decrypt pass through unchanged (graceful degradation for dev/test).
 */

import crypto from 'crypto';
import { logger } from '../lib/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCRYPTED_PREFIX = 'enc:v1:';

let encryptionKey: Buffer | null = null;
let keyWarningLogged = false;

/**
 * Lazily resolves the encryption key from the environment.
 * Returns null if not configured.
 */
function getKey(): Buffer | null {
  if (encryptionKey) return encryptionKey;

  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    if (!keyWarningLogged && process.env.NODE_ENV === 'production') {
      logger.warn(
        '[FieldEncryption] FIELD_ENCRYPTION_KEY is not set. Sensitive fields will NOT be encrypted. ' +
          'Set a 32-byte base64-encoded key to enable application-level encryption.',
      );
      keyWarningLogged = true;
    }
    return null;
  }

  const keyBuffer = Buffer.from(raw, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `[FieldEncryption] FIELD_ENCRYPTION_KEY must be exactly 32 bytes (got ${keyBuffer.length}). ` +
        'Generate one with: openssl rand -base64 32',
    );
  }

  encryptionKey = keyBuffer;
  return encryptionKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns the format `enc:v1:<iv>:<authTag>:<ciphertext>` (base64 segments).
 * If no encryption key is configured, returns plaintext unchanged.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX +
    iv.toString('base64') +
    ':' +
    authTag.toString('base64') +
    ':' +
    encrypted.toString('base64')
  );
}

/**
 * Decrypt a value produced by `encrypt()`.
 *
 * If the value does not match the encrypted format (e.g. legacy plaintext),
 * it is returned unchanged. If decryption fails due to corrupted data or
 * wrong key, returns an empty string rather than throwing.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  if (!key) return encrypted;

  if (!isEncrypted(encrypted)) return encrypted;

  try {
    const payload = encrypted.slice(ENCRYPTED_PREFIX.length);
    const [ivB64, authTagB64, ciphertextB64] = payload.split(':');

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    logger.error('[FieldEncryption] Decryption failed — returning empty string', {
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

/**
 * Check whether a value matches the encrypted format.
 */
export function isEncrypted(value: string): boolean {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return false;

  const payload = value.slice(ENCRYPTED_PREFIX.length);
  const segments = payload.split(':');
  // 3 segments: iv, authTag, ciphertext (ciphertext may be empty for empty plaintext)
  return segments.length === 3 && segments[0].length > 0 && segments[1].length > 0;
}

/**
 * Reset internal state. Exported only for testing — forces re-read of env var on next call.
 * @internal
 */
export function _resetForTesting(): void {
  encryptionKey = null;
  keyWarningLogged = false;
}
