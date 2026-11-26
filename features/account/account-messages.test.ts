import { describe, expect, it } from 'vitest';
import { ACCOUNT_MESSAGE_TYPES, isAccountMessage } from '@/messaging/contracts';

describe('account messages', () => {
  it('recognises only account message types', () => {
    for (const type of ACCOUNT_MESSAGE_TYPES) expect(isAccountMessage({ type })).toBe(true);
    expect(isAccountMessage({ type: 'ACCOUNT_DELETE_EVERYTHING' })).toBe(false);
    expect(isAccountMessage({ type: 'GET_SETTINGS' })).toBe(false);
    expect(isAccountMessage(null)).toBe(false);
    expect(isAccountMessage('ACCOUNT_GET')).toBe(false);
  });
});
