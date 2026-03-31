/**
 * Encryption Service — Higher-Level Field Encryption for Prisma Models
 *
 * Provides helpers to encrypt/decrypt specified string fields on any record.
 * This is a preparation layer; actual integration into Prisma middleware or
 * repository hooks will come in a future migration.
 *
 * ── Sensitive fields to encrypt (future integration) ──────────────────────
 *
 * | Model            | Field                | Rationale                              |
 * |------------------|----------------------|----------------------------------------|
 * | Message          | content              | User messages contain emotional venting |
 * | InnerWorkMessage | content              | Private self-reflection                |
 * | UserVessel       | conversationSummary  | Summarized emotional content           |
 * | EmpathyDraft     | content              | Empathy statements about partner       |
 * | EmpathyAttempt   | content              | Guessed empathy statements             |
 */

import { encrypt, decrypt } from '../utils/field-encryption';

/**
 * Encrypt specified string fields on a record, returning a shallow copy.
 * Non-string fields in the list are silently skipped.
 */
export function encryptSensitiveFields<T extends Record<string, unknown>>(
  record: T,
  fields: (keyof T)[],
): T {
  const copy = { ...record };
  for (const field of fields) {
    const value = copy[field];
    if (typeof value === 'string') {
      (copy as Record<string, unknown>)[field as string] = encrypt(value);
    }
  }
  return copy;
}

/**
 * Decrypt specified string fields on a record, returning a shallow copy.
 * Non-string fields in the list are silently skipped.
 */
export function decryptSensitiveFields<T extends Record<string, unknown>>(
  record: T,
  fields: (keyof T)[],
): T {
  const copy = { ...record };
  for (const field of fields) {
    const value = copy[field];
    if (typeof value === 'string') {
      (copy as Record<string, unknown>)[field as string] = decrypt(value);
    }
  }
  return copy;
}
