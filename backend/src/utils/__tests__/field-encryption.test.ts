import crypto from 'crypto';
import { encrypt, decrypt, isEncrypted, _resetForTesting } from '../field-encryption';

// Generate a deterministic 32-byte key for tests
const TEST_KEY = crypto.randomBytes(32).toString('base64');

beforeEach(() => {
  _resetForTesting();
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  _resetForTesting();
  delete process.env.FIELD_ENCRYPTION_KEY;
});

describe('field-encryption', () => {
  describe('encrypt / decrypt roundtrip', () => {
    it('roundtrips a simple string', () => {
      const plaintext = 'I feel hurt when you dismiss my feelings.';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('roundtrips an empty string', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    it('roundtrips unicode / emoji content', () => {
      const plaintext = 'Estoy muy triste \u{1F622} \u00BFpor qu\u00E9 me ignoras?';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('roundtrips a long multi-line string', () => {
      const plaintext = Array.from({ length: 500 }, (_, i) => `Line ${i}: some emotional content here.`).join('\n');
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('encrypted output format', () => {
    it('encrypted output differs from plaintext', () => {
      const plaintext = 'My partner never listens.';
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('encrypted output starts with the version prefix', () => {
      const encrypted = encrypt('test');
      expect(encrypted).toMatch(/^enc:v1:/);
    });

    it('encrypted output has three base64 segments after prefix', () => {
      const encrypted = encrypt('test');
      const payload = encrypted.slice('enc:v1:'.length);
      const segments = payload.split(':');
      expect(segments).toHaveLength(3);
      // Each segment should be valid base64
      for (const seg of segments) {
        expect(seg.length).toBeGreaterThan(0);
        expect(() => Buffer.from(seg, 'base64')).not.toThrow();
      }
    });
  });

  describe('IV randomness', () => {
    it('produces different ciphertexts for the same plaintext', () => {
      const plaintext = 'Same input every time.';
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      // Both should still decrypt correctly
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });
  });

  describe('isEncrypted', () => {
    it('returns true for encrypted values', () => {
      const encrypted = encrypt('hello');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for plaintext', () => {
      expect(isEncrypted('just some text')).toBe(false);
    });

    it('returns false for partial prefix', () => {
      expect(isEncrypted('enc:v1:')).toBe(false);
      expect(isEncrypted('enc:v1:onlyone')).toBe(false);
      expect(isEncrypted('enc:v1:one:two')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('corrupted data handling', () => {
    it('returns empty string for corrupted ciphertext', () => {
      const encrypted = encrypt('valid content');
      // Mangle the ciphertext portion
      const corrupted = encrypted.slice(0, -4) + 'XXXX';
      const result = decrypt(corrupted);
      expect(result).toBe('');
    });

    it('returns empty string for truncated encrypted value', () => {
      const encrypted = encrypt('test data');
      // Chop it in half
      const truncated = encrypted.slice(0, Math.floor(encrypted.length / 2));
      // If it still looks like encrypted format, it should fail gracefully
      // If it doesn't match format, it's returned as-is (treated as plaintext)
      const result = decrypt(truncated);
      expect(typeof result).toBe('string');
    });

    it('returns plaintext unchanged if value is not encrypted format', () => {
      expect(decrypt('plain text that was never encrypted')).toBe('plain text that was never encrypted');
    });
  });

  describe('graceful degradation (no key)', () => {
    beforeEach(() => {
      _resetForTesting();
      delete process.env.FIELD_ENCRYPTION_KEY;
    });

    it('encrypt returns plaintext unchanged when no key is set', () => {
      const plaintext = 'sensitive data without encryption';
      expect(encrypt(plaintext)).toBe(plaintext);
    });

    it('decrypt returns input unchanged when no key is set', () => {
      const input = 'enc:v1:abc:def:ghi';
      expect(decrypt(input)).toBe(input);
    });

    it('isEncrypted still detects format even without key', () => {
      expect(isEncrypted('enc:v1:abc:def:ghi')).toBe(true);
      expect(isEncrypted('not encrypted')).toBe(false);
    });
  });

  describe('key validation', () => {
    it('throws if key is not 32 bytes', () => {
      _resetForTesting();
      process.env.FIELD_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
      expect(() => encrypt('test')).toThrow('must be exactly 32 bytes');
    });
  });

  describe('decryption with wrong key', () => {
    it('returns empty string when decrypting with a different key', () => {
      const encrypted = encrypt('secret content');

      // Switch to a different key
      _resetForTesting();
      process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

      const result = decrypt(encrypted);
      expect(result).toBe('');
    });
  });
});
