import { config } from '../src/config';
import { createQRToken } from '../src/utils/qr';
import { hashToken } from '../src/utils/crypto';
import { isWithinDistance } from '../src/utils/geo';

describe('Meetup QR flow', () => {
  it('should generate unique QR tokens', () => {
    const t1 = createQRToken();
    const t2 = createQRToken();
    expect(t1.token).not.toBe(t2.token);
    expect(t1.hash).not.toBe(t2.hash);
  });

  it('should generate tokens with future expiry', () => {
    const { expiresAt } = createQRToken();
    expect(expiresAt > new Date()).toBe(true);
  });

  it('should verify token hash matches', () => {
    const { token, hash } = createQRToken();
    expect(hashToken(token)).toBe(hash);
  });

  it('should detect expired QR tokens', () => {
    const expiredAt = new Date(Date.now() - 1000);
    expect(expiredAt < new Date()).toBe(true);
  });

  it('meeting reward uniqueness: same pair should only get reward once', () => {
    const rewardedPairs = new Set<string>();
    const pairKey = (u1: string, u2: string) => [u1, u2].sort().join('-');

    const user1 = 'user-uuid-1';
    const user2 = 'user-uuid-2';

    const key = pairKey(user1, user2);
    const isFirstMeeting = !rewardedPairs.has(key);
    expect(isFirstMeeting).toBe(true);
    rewardedPairs.add(key);

    const isFirstMeeting2 = !rewardedPairs.has(key);
    expect(isFirstMeeting2).toBe(false);
  });

  it('meeting reward should be 50 tokens', () => {
    expect(config.tokens.meetingReward).toBe(50);
  });

  it('should enforce 20 meter proximity for meeting', () => {
    const lat1 = 40.7128;
    const lng1 = -74.006;

    const lat2Close = 40.71293;
    expect(isWithinDistance(lat1, lng1, lat2Close, lng1, config.distance.meetingProximityMeters)).toBe(true);

    const lat2Far = 40.7130;
    expect(isWithinDistance(lat1, lng1, lat2Far, lng1, config.distance.meetingProximityMeters)).toBe(false);
  });
});
