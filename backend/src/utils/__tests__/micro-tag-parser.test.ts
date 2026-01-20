import { parseMicroTagResponse, ParsedMicroTagResponse } from '../micro-tag-parser';

describe('micro-tag-parser', () => {
  describe('parseMicroTagResponse', () => {
    it('extracts thinking block content', () => {
      const raw = `<thinking>
Mode:Witness | Intensity:8 | FeelHeardCheck:Y | Strategy:Validate
</thinking>

I hear you. That sounds really difficult.`;

      const result = parseMicroTagResponse(raw);

      expect(result.thinking).toContain('Mode:Witness');
      expect(result.thinking).toContain('FeelHeardCheck:Y');
    });

    it('extracts clean response text without tags', () => {
      const raw = `<thinking>
Mode:Witness | FeelHeardCheck:N
</thinking>

I hear you. That sounds really difficult.`;

      const result = parseMicroTagResponse(raw);

      expect(result.response).toBe('I hear you. That sounds really difficult.');
      expect(result.response).not.toContain('<thinking>');
    });

    it('extracts FeelHeardCheck:Y as true', () => {
      const raw = `<thinking>FeelHeardCheck:Y</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(true);
    });

    it('extracts FeelHeardCheck:N as false', () => {
      const raw = `<thinking>FeelHeardCheck:N</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(false);
    });

    it('extracts ReadyShare:Y as true', () => {
      const raw = `<thinking>ReadyShare:Y</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerReadyToShare).toBe(true);
    });

    it('extracts draft block as invitationMessage', () => {
      const raw = `<thinking>Mode:Invitation</thinking>

<draft>
I've been thinking about us and would love to have a real conversation. Join me?
</draft>

Here's a draft invitation for you to review.`;

      const result = parseMicroTagResponse(raw);

      expect(result.draft).toContain("I've been thinking about us");
      expect(result.response).toBe("Here's a draft invitation for you to review.");
      expect(result.response).not.toContain('<draft>');
    });

    it('extracts dispatch tag', () => {
      const raw = `<thinking>User asking about process</thinking>

<dispatch>EXPLAIN_PROCESS</dispatch>

Let me explain how this works.`;

      const result = parseMicroTagResponse(raw);

      expect(result.dispatchTag).toBe('EXPLAIN_PROCESS');
    });

    it('handles response with no tags gracefully', () => {
      const raw = 'Just a plain response with no tags.';
      const result = parseMicroTagResponse(raw);

      expect(result.response).toBe('Just a plain response with no tags.');
      expect(result.thinking).toBe('');
      expect(result.draft).toBeNull();
      expect(result.dispatchTag).toBeNull();
    });

    it('handles malformed thinking tags', () => {
      const raw = `<thinking>Incomplete

Response without closing tag.`;

      const result = parseMicroTagResponse(raw);
      // Should return raw text as response when tags are malformed
      expect(result.response).toBeTruthy();
    });

    it('strips multiple tag types from response', () => {
      const raw = `<thinking>Analysis here</thinking>

<draft>Draft content</draft>

<dispatch>SOME_TAG</dispatch>

The actual response.`;

      const result = parseMicroTagResponse(raw);

      expect(result.response).toBe('The actual response.');
    });

    it('handles whitespace variations in flag extraction', () => {
      const raw = `<thinking>FeelHeardCheck: Y</thinking>Response`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(true);
    });

    it('is case-insensitive for flag extraction', () => {
      const raw = `<thinking>feelheardcheck:y</thinking>Response`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(true);
    });

    it('extracts ReadyShare:N as false', () => {
      const raw = `<thinking>ReadyShare:N</thinking>Response text`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerReadyToShare).toBe(false);
    });

    it('defaults flags to false when not present', () => {
      const raw = `<thinking>Just some analysis</thinking>Response`;
      const result = parseMicroTagResponse(raw);
      expect(result.offerFeelHeardCheck).toBe(false);
      expect(result.offerReadyToShare).toBe(false);
    });

    it('trims whitespace from draft content', () => {
      const raw = `<thinking>test</thinking>
<draft>

  Draft with whitespace

</draft>
Response`;
      const result = parseMicroTagResponse(raw);
      expect(result.draft).toBe('Draft with whitespace');
    });

    it('trims whitespace from dispatch tag', () => {
      const raw = `<thinking>test</thinking>
<dispatch>  EXPLAIN_PROCESS  </dispatch>
Response`;
      const result = parseMicroTagResponse(raw);
      expect(result.dispatchTag).toBe('EXPLAIN_PROCESS');
    });
  });
});
