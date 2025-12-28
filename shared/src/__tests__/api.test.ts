import { z } from 'zod';
import { apiErrorSchema, apiResponseSchema, apiErrorResponseSchema, ApiErrorCode } from '../api';

describe('API wrappers', () => {
  it('parses successful responses', () => {
    const schema = apiResponseSchema(
      z.object({
        value: z.string(),
      }),
    );

    const result = schema.safeParse({
      success: true,
      data: { value: 'ok' },
    });

    expect(result.success).toBe(true);
  });

  it('parses error responses with codes', () => {
    const result = apiErrorResponseSchema.safeParse({
      success: false,
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid input',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown error codes', () => {
    const result = apiErrorSchema.safeParse({
      code: 'NOT_A_CODE',
      message: 'nope',
    });

    expect(result.success).toBe(false);
  });
});
