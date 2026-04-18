import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler.middleware';
import { JWTPayload } from '../../middleware/auth.middleware';

const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  gender: 'male' | 'female' | 'other';
  displayName: string;
  birthdate?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function registerUser(input: RegisterInput) {
  const { email, password, gender, displayName, birthdate } = input;

  return withTransaction(async (client: PoolClient) => {
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();

    await client.query(
      `INSERT INTO users (id, email, password_hash, gender) VALUES ($1, $2, $3, $4)`,
      [userId, email.toLowerCase(), passwordHash, gender]
    );

    await client.query(
      `INSERT INTO profiles (user_id, display_name, birthdate) VALUES ($1, $2, $3)`,
      [userId, displayName, birthdate || null]
    );

    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`,
      [userId]
    );

    const idempotencyKey = `signup-bonus-${userId}`;
    const bonusAmount = config.tokens.signupBonus;

    await client.query(
      `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2`,
      [bonusAmount, userId]
    );

    await client.query(
      `INSERT INTO ledger_entries 
       (user_id, amount, type, reference_type, balance_after, description, idempotency_key)
       VALUES ($1, $2, 'credit', 'signup_bonus', $2, 'Sign-up bonus tokens', $3)`,
      [userId, bonusAmount, idempotencyKey]
    );

    await client.query(
      `INSERT INTO audit_events (user_id, event_type, entity_type, entity_id, data)
       VALUES ($1, 'user.registered', 'user', $1, $2)`,
      [userId, JSON.stringify({ email: email.toLowerCase(), gender })]
    );

    const token = generateToken({ userId, email: email.toLowerCase(), gender, role: 'user' });

    return {
      token,
      user: { id: userId, email: email.toLowerCase(), gender, role: 'user' },
      signupBonus: bonusAmount,
    };
  });
}

export async function loginUser(input: LoginInput) {
  const { email, password } = input;

  const { rows } = await query(
    `SELECT u.id, u.email, u.password_hash, u.gender, u.role, u.is_active
     FROM users u WHERE u.email = $1`,
    [email.toLowerCase()]
  );

  if (rows.length === 0) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const user = rows[0];

  if (!user.is_active) {
    throw new AppError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  await query(
    `INSERT INTO audit_events (user_id, event_type, entity_type, entity_id)
     VALUES ($1, 'user.logged_in', 'user', $1)`,
    [user.id]
  );

  const token = generateToken({
    userId: user.id,
    email: user.email,
    gender: user.gender,
    role: user.role,
  });

  return {
    token,
    user: { id: user.id, email: user.email, gender: user.gender, role: user.role },
  };
}

function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}
