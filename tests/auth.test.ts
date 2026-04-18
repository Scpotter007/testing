import { config } from '../src/config';
import { encryptMessage, decryptMessage, generateSecureToken, hashToken } from '../src/utils/crypto';

describe('Config', () => {
  it('should have signup bonus of 50 tokens', () => {
    expect(config.tokens.signupBonus).toBe(50);
  });

  it('should have meeting reward of 50 tokens', () => {
    expect(config.tokens.meetingReward).toBe(50);
  });

  it('should have discovery radius of 20000 meters', () => {
    expect(config.distance.discoveryRadiusMeters).toBe(20000);
  });

  it('should have meeting proximity of 20 meters', () => {
    expect(config.distance.meetingProximityMeters).toBe(20);
  });
});

describe('Crypto utils', () => {
  it('should encrypt and decrypt messages', () => {
    const secret = 'test-secret';
    const original = 'Hello, world!';
    const { encrypted, iv } = encryptMessage(original, secret);
    expect(encrypted).not.toBe(original);
    const decrypted = decryptMessage(encrypted, iv, secret);
    expect(decrypted).toBe(original);
  });

  it('should generate secure tokens', () => {
    const t1 = generateSecureToken();
    const t2 = generateSecureToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThan(0);
  });

  it('should hash tokens consistently', () => {
    const token = 'test-token';
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken('other-token'));
  });
});
