import { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler.middleware';

export type LedgerEntryType =
  | 'credit'
  | 'debit'
  | 'escrow_reserve'
  | 'escrow_release'
  | 'escrow_finalize'
  | 'purchase'
  | 'voucher_credit'
  | 'meeting_reward';

export async function getWallet(userId: string) {
  const { rows } = await query(
    `SELECT w.*, 
       (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1 AND amount > 0) as total_credits,
       (SELECT COALESCE(SUM(ABS(amount)), 0) FROM ledger_entries WHERE user_id = $1 AND amount < 0) as total_debits
     FROM wallets w WHERE w.user_id = $1`,
    [userId]
  );
  if (rows.length === 0) {
    throw new AppError(404, 'Wallet not found', 'WALLET_NOT_FOUND');
  }
  return rows[0];
}

export async function getLedger(userId: string, limit = 50, offset = 0) {
  const { rows } = await query(
    `SELECT * FROM ledger_entries WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

export async function creditTokens(
  client: PoolClient,
  userId: string,
  amount: number,
  type: LedgerEntryType,
  referenceId: string | null,
  referenceType: string | null,
  description: string,
  idempotencyKey?: string
): Promise<void> {
  if (amount <= 0) throw new AppError(400, 'Credit amount must be positive', 'INVALID_AMOUNT');

  if (idempotencyKey) {
    const existing = await client.query(
      'SELECT id FROM ledger_entries WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existing.rows.length > 0) return;
  }

  await client.query(
    `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2`,
    [amount, userId]
  );

  const { rows } = await client.query(
    'SELECT balance FROM wallets WHERE user_id = $1',
    [userId]
  );
  const balanceAfter = rows[0].balance;

  await client.query(
    `INSERT INTO ledger_entries 
     (user_id, amount, type, reference_id, reference_type, balance_after, description, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, amount, type, referenceId, referenceType, balanceAfter, description, idempotencyKey || null]
  );
}

export async function debitTokens(
  client: PoolClient,
  userId: string,
  amount: number,
  type: LedgerEntryType,
  referenceId: string | null,
  referenceType: string | null,
  description: string,
  idempotencyKey?: string
): Promise<void> {
  if (amount <= 0) throw new AppError(400, 'Debit amount must be positive', 'INVALID_AMOUNT');

  if (idempotencyKey) {
    const existing = await client.query(
      'SELECT id FROM ledger_entries WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existing.rows.length > 0) return;
  }

  const { rows } = await client.query(
    'SELECT balance, reserved FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  if (rows.length === 0) throw new AppError(404, 'Wallet not found', 'WALLET_NOT_FOUND');

  const wallet = rows[0];
  const availableBalance = wallet.balance - wallet.reserved;

  if (availableBalance < amount) {
    throw new AppError(400, 'Insufficient tokens', 'INSUFFICIENT_BALANCE');
  }

  await client.query(
    `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2`,
    [amount, userId]
  );

  const balanceAfter = wallet.balance - amount;

  await client.query(
    `INSERT INTO ledger_entries 
     (user_id, amount, type, reference_id, reference_type, balance_after, description, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, -amount, type, referenceId, referenceType, balanceAfter, description, idempotencyKey || null]
  );
}

export async function reserveTokens(
  client: PoolClient,
  userId: string,
  amount: number,
  referenceId: string,
  referenceType: string,
  idempotencyKey: string
): Promise<string> {
  const existing = await client.query(
    'SELECT id FROM escrows WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const { rows: walletRows } = await client.query(
    'SELECT balance, reserved FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  if (walletRows.length === 0) throw new AppError(404, 'Wallet not found', 'WALLET_NOT_FOUND');

  const wallet = walletRows[0];
  const available = wallet.balance - wallet.reserved;

  if (available < amount) {
    throw new AppError(400, 'Insufficient tokens to reserve', 'INSUFFICIENT_BALANCE');
  }

  await client.query(
    'UPDATE wallets SET reserved = reserved + $1, updated_at = NOW() WHERE user_id = $2',
    [amount, userId]
  );

  const { rows: escrowRows } = await client.query(
    `INSERT INTO escrows (user_id, amount, status, reference_id, reference_type, idempotency_key)
     VALUES ($1, $2, 'locked', $3, $4, $5)
     RETURNING id`,
    [userId, amount, referenceId, referenceType, idempotencyKey]
  );

  const escrowId = escrowRows[0].id;

  await client.query(
    `INSERT INTO ledger_entries
     (user_id, amount, type, reference_id, reference_type, balance_after, description)
     VALUES ($1, $2, 'escrow_reserve', $3, 'escrow', $4, $5)`,
    [userId, -amount, escrowId, wallet.balance, `Reserved ${amount} tokens in escrow`]
  );

  return escrowId;
}

export async function finalizeEscrow(
  client: PoolClient,
  escrowId: string,
  beneficiaryId: string,
  referenceId: string
): Promise<void> {
  const { rows } = await client.query(
    'SELECT * FROM escrows WHERE id = $1 FOR UPDATE',
    [escrowId]
  );
  if (rows.length === 0) throw new AppError(404, 'Escrow not found', 'ESCROW_NOT_FOUND');

  const escrow = rows[0];
  if (escrow.status !== 'locked') {
    throw new AppError(409, `Escrow already ${escrow.status}`, 'ESCROW_ALREADY_RESOLVED');
  }

  const amount = escrow.amount;
  const senderId = escrow.user_id;

  await client.query(
    `UPDATE wallets 
     SET balance = balance - $1, reserved = reserved - $1, updated_at = NOW() 
     WHERE user_id = $2`,
    [amount, senderId]
  );

  const { rows: senderWallet } = await client.query(
    'SELECT balance FROM wallets WHERE user_id = $1',
    [senderId]
  );

  await client.query(
    `INSERT INTO ledger_entries
     (user_id, amount, type, reference_id, reference_type, balance_after, description)
     VALUES ($1, $2, 'escrow_finalize', $3, 'escrow', $4, $5)`,
    [senderId, -amount, escrowId, senderWallet[0].balance, `Escrow finalized: ${amount} tokens transferred`]
  );

  await client.query(
    'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [amount, beneficiaryId]
  );
  const { rows: benWallet } = await client.query(
    'SELECT balance FROM wallets WHERE user_id = $1',
    [beneficiaryId]
  );
  await client.query(
    `INSERT INTO ledger_entries
     (user_id, amount, type, reference_id, reference_type, balance_after, description)
     VALUES ($1, $2, 'voucher_credit', $3, 'request', $4, $5)`,
    [beneficiaryId, amount, referenceId, benWallet[0].balance, `Received ${amount} tokens from accepted request`]
  );

  await client.query(
    `UPDATE escrows SET status = 'finalized', resolved_at = NOW() WHERE id = $1`,
    [escrowId]
  );

  await client.query(
    `INSERT INTO vouchers (user_id, amount, source_request_id, status)
     VALUES ($1, $2, $3, 'active')`,
    [beneficiaryId, amount, referenceId]
  );
}

export async function releaseEscrow(
  client: PoolClient,
  escrowId: string
): Promise<void> {
  const { rows } = await client.query(
    'SELECT * FROM escrows WHERE id = $1 FOR UPDATE',
    [escrowId]
  );
  if (rows.length === 0) throw new AppError(404, 'Escrow not found', 'ESCROW_NOT_FOUND');

  const escrow = rows[0];
  if (escrow.status !== 'locked') {
    throw new AppError(409, `Escrow already ${escrow.status}`, 'ESCROW_ALREADY_RESOLVED');
  }

  const amount = escrow.amount;
  const userId = escrow.user_id;

  await client.query(
    'UPDATE wallets SET reserved = reserved - $1, updated_at = NOW() WHERE user_id = $2',
    [amount, userId]
  );

  const { rows: walletRows } = await client.query(
    'SELECT balance FROM wallets WHERE user_id = $1',
    [userId]
  );

  await client.query(
    `INSERT INTO ledger_entries
     (user_id, amount, type, reference_id, reference_type, balance_after, description)
     VALUES ($1, $2, 'escrow_release', $3, 'escrow', $4, $5)`,
    [userId, amount, escrowId, walletRows[0].balance, `Escrow released: ${amount} tokens returned`]
  );

  await client.query(
    `UPDATE escrows SET status = 'released', resolved_at = NOW() WHERE id = $1`,
    [escrowId]
  );
}

export interface PaymentGateway {
  createOrder(userId: string, amountCents: number, tokenAmount: number, currency: string): Promise<{ orderId: string; providerOrderId: string }>;
  verifyPayment(orderId: string, providerPaymentId: string): Promise<boolean>;
}

class MockPaymentGateway implements PaymentGateway {
  async createOrder(userId: string, amountCents: number, tokenAmount: number, currency: string) {
    const { rows } = await query(
      `INSERT INTO payment_orders (user_id, provider, provider_order_id, amount_cents, token_amount, currency, status)
       VALUES ($1, 'mock', $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [userId, `mock_${Date.now()}`, amountCents, tokenAmount, currency]
    );
    return { orderId: rows[0].id, providerOrderId: `mock_${Date.now()}` };
  }

  async verifyPayment(_orderId: string, _providerPaymentId: string): Promise<boolean> {
    return true;
  }
}

export function getPaymentGateway(provider: string): PaymentGateway {
  switch (provider) {
    case 'mock':
      return new MockPaymentGateway();
    default:
      throw new AppError(500, `Unknown payment provider: ${provider}`, 'UNKNOWN_PROVIDER');
  }
}

export async function purchaseTokens(
  userId: string,
  amountCents: number,
  tokenAmount: number,
  currency = 'USD'
): Promise<{ orderId: string; tokensGranted: number }> {
  const gateway = getPaymentGateway(config.payment.provider);

  return withTransaction(async (client) => {
    const { orderId, providerOrderId } = await gateway.createOrder(userId, amountCents, tokenAmount, currency);

    const verified = await gateway.verifyPayment(orderId, providerOrderId);

    if (verified) {
      await client.query(
        `UPDATE payment_orders SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [orderId]
      );

      const idempotencyKey = `purchase-${orderId}`;
      await creditTokens(client, userId, tokenAmount, 'purchase', orderId, 'payment_order', `Purchased ${tokenAmount} tokens`, idempotencyKey);
    }

    return { orderId, tokensGranted: verified ? tokenAmount : 0 };
  });
}
