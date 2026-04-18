import dotenv from 'dotenv';

dotenv.config();

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dating_app',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  tokens: {
    signupBonus: parseInt(process.env.SIGNUP_BONUS_TOKENS || '50', 10),
    meetingReward: parseInt(process.env.MEETING_REWARD_TOKENS || '50', 10),
    minRequestTokens: parseInt(process.env.MIN_REQUEST_TOKENS || '10', 10),
    requestExpiryHours: parseInt(process.env.REQUEST_EXPIRY_HOURS || '24', 10),
  },
  distance: {
    discoveryRadiusMeters: parseInt(process.env.DISCOVERY_RADIUS_METERS || '20000', 10),
    meetingProximityMeters: parseInt(process.env.MEETING_PROXIMITY_METERS || '20', 10),
  },
  qr: {
    tokenTtlSeconds: parseInt(process.env.QR_TOKEN_TTL_SECONDS || '300', 10),
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'mock',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  requests: {
    // Configurable gender pairing for connection requests.
    // Default: male → female as specified in the MVP requirements.
    // Set to 'open' to allow any-to-any requests regardless of gender.
    genderPairing: (process.env.REQUEST_GENDER_PAIRING || 'male_to_female') as
      | 'male_to_female'
      | 'open',
  },
};
