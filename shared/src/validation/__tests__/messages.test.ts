/**
 * Messages Validation Tests
 */

import { sendMessageRequestSchema, getMessagesQuerySchema, messageResponseSchema } from '../messages';
import { MessageRole } from '../../enums';

describe('sendMessageRequestSchema', () => {
  it('accepts valid message', () => {
    const result = sendMessageRequestSchema.safeParse({
      content: 'Hello, I want to talk about...',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = sendMessageRequestSchema.safeParse({
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message over 5000 chars', () => {
    const result = sendMessageRequestSchema.safeParse({
      content: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe('getMessagesQuerySchema', () => {
  it('accepts empty query with defaults', () => {
    const result = getMessagesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('coerces string limit', () => {
    const result = getMessagesQuerySchema.safeParse({ limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('accepts before cursor', () => {
    const result = getMessagesQuerySchema.safeParse({
      before: 'message-id-123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts after cursor', () => {
    const result = getMessagesQuerySchema.safeParse({
      after: 'message-id-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit over 100', () => {
    const result = getMessagesQuerySchema.safeParse({
      limit: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe('messageResponseSchema', () => {
  it('accepts valid message', () => {
    const result = messageResponseSchema.safeParse({
      id: 'msg-123',
      content: 'Hello',
      role: MessageRole.USER,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts AI role', () => {
    const result = messageResponseSchema.safeParse({
      id: 'msg-123',
      content: 'Hello',
      role: MessageRole.AI,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts SYSTEM role', () => {
    const result = messageResponseSchema.safeParse({
      id: 'msg-123',
      content: 'System message',
      role: MessageRole.SYSTEM,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = messageResponseSchema.safeParse({
      id: 'msg-123',
      content: 'Hello',
      role: 'INVALID',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
