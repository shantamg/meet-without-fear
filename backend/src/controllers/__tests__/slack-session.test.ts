/**
 * Slack Session Controller Tests
 *
 * Verifies the shared-secret validation and payload-validation logic of the
 * `POST /api/slack/mwf-session` endpoint. The actual Bedrock pipeline is
 * covered by the orchestrator/conversation tests and is mocked out here.
 */

jest.mock('../../services/slack-session-orchestrator', () => ({
  handleSlackMessage: jest.fn().mockResolvedValue(undefined),
}));

import type { Request, Response } from 'express';
import { handleMwfSessionMessage, slackHealth } from '../slack-session';
import { handleSlackMessage } from '../../services/slack-session-orchestrator';

function makeRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return {
    body,
    header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
  } as unknown as Request;
}

describe('slack-session controller', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('handleMwfSessionMessage', () => {
    const validPayload = {
      channel: 'C123',
      user: 'U123',
      text: 'hello',
      ts: '1.000',
    };

    it('accepts a valid payload without a secret when none is configured (dev)', async () => {
      delete process.env.SLACK_INGRESS_SECRET;
      (process.env as Record<string, string>).NODE_ENV = 'development';

      const res = makeRes();
      await handleMwfSessionMessage(makeReq(validPayload), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(handleSlackMessage).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'C123',
        user: 'U123',
      }));
    });

    it('rejects when production env has no secret configured', async () => {
      delete process.env.SLACK_INGRESS_SECRET;
      (process.env as Record<string, string>).NODE_ENV = 'production';

      const res = makeRes();
      await handleMwfSessionMessage(makeReq(validPayload), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(handleSlackMessage).not.toHaveBeenCalled();
    });

    it('accepts when the correct shared secret is provided via header', async () => {
      process.env.SLACK_INGRESS_SECRET = 'shhh';

      const res = makeRes();
      await handleMwfSessionMessage(
        makeReq(validPayload, { 'x-slack-ingress-secret': 'shhh' }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(handleSlackMessage).toHaveBeenCalled();
    });

    it('rejects when the shared secret is wrong', async () => {
      process.env.SLACK_INGRESS_SECRET = 'shhh';

      const res = makeRes();
      await handleMwfSessionMessage(
        makeReq(validPayload, { 'x-slack-ingress-secret': 'nope' }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(handleSlackMessage).not.toHaveBeenCalled();
    });

    it('rejects malformed payloads with 400', async () => {
      delete process.env.SLACK_INGRESS_SECRET;

      const res = makeRes();
      await handleMwfSessionMessage(
        makeReq({ channel: 'C123' /* missing user/ts/text */ }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(handleSlackMessage).not.toHaveBeenCalled();
    });
  });

  describe('slackHealth', () => {
    it('reports slack config status', () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-test';
      process.env.SLACK_INGRESS_SECRET = 'shhh';
      const res = makeRes();
      slackHealth({} as Request, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          slackConfigured: true,
          secretRequired: true,
        })
      );
    });
  });
});
