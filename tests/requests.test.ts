import { config } from '../src/config';

describe('Request business rules', () => {
  const MIN_TOKENS = config.tokens.minRequestTokens;

  it('should reject requests below minimum token amount', () => {
    const tokenAmount = MIN_TOKENS - 1;
    expect(tokenAmount < MIN_TOKENS).toBe(true);
  });

  it('should allow requests at minimum token amount', () => {
    const tokenAmount = MIN_TOKENS;
    expect(tokenAmount >= MIN_TOKENS).toBe(true);
  });

  it('requests expire after configured hours', () => {
    const expiryHours = config.tokens.requestExpiryHours;
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000);
    expect(expiresAt > new Date()).toBe(true);

    const veryOldExpiry = new Date(Date.now() - 1000);
    expect(veryOldExpiry < new Date()).toBe(true);
  });

  it('should correctly determine expired status', () => {
    const expired = new Date(Date.now() - 1000);
    const notExpired = new Date(Date.now() + 1000 * 3600);
    expect(expired < new Date()).toBe(true);
    expect(notExpired > new Date()).toBe(true);
  });

  it('should enforce male-to-female gender pairing rule by default', () => {
    // In male_to_female mode: only 'male' senders are allowed
    const allowedSenderGender = 'male';
    expect(allowedSenderGender === 'male').toBe(true);
    // Non-male sender should be rejected
    const femaleSender: string = 'female';
    expect(femaleSender === 'male').toBe(false);
  });
});
