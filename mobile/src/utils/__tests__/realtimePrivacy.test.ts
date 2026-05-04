import {
  canInsertRealtimeMessageForCurrentUser,
  isRealtimePayloadAddressedToCurrentUser,
} from '../realtimePrivacy';

describe('realtime privacy helpers', () => {
  it('allows public payloads without a recipient', () => {
    expect(isRealtimePayloadAddressedToCurrentUser({}, 'user-1')).toBe(true);
  });

  it('allows payloads explicitly addressed to the current user', () => {
    expect(isRealtimePayloadAddressedToCurrentUser({ forUserId: 'user-1' }, 'user-1')).toBe(true);
  });

  it('rejects payloads addressed to another user', () => {
    expect(isRealtimePayloadAddressedToCurrentUser({ forUserId: 'user-2' }, 'user-1')).toBe(false);
  });

  it('rejects private messages addressed to another user even when the event is public', () => {
    expect(
      isRealtimePayloadAddressedToCurrentUser(
        { message: { forUserId: 'user-2' } },
        'user-1'
      )
    ).toBe(false);
  });

  it('only permits realtime message insertion for public or current-user messages', () => {
    expect(canInsertRealtimeMessageForCurrentUser({ id: 'm1' }, 'user-1')).toBe(true);
    expect(canInsertRealtimeMessageForCurrentUser({ id: 'm2', forUserId: 'user-1' }, 'user-1')).toBe(true);
    expect(canInsertRealtimeMessageForCurrentUser({ id: 'm3', forUserId: 'user-2' }, 'user-1')).toBe(false);
  });
});
