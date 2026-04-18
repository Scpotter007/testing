import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler.middleware';
import { reserveTokens, finalizeEscrow, releaseEscrow } from '../wallet/wallet.service';

export async function createRequest(
  fromUserId: string,
  toUserId: string,
  tokenAmount: number,
  message?: string,
  idempotencyKey?: string
) {
  if (tokenAmount < config.tokens.minRequestTokens) {
    throw new AppError(
      400,
      `Minimum token amount is ${config.tokens.minRequestTokens}`,
      'INSUFFICIENT_TOKEN_AMOUNT'
    );
  }

  return withTransaction(async (client) => {
    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT * FROM requests WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing.rows.length > 0) return existing.rows[0];
    }

    const { rows: fromUserRows } = await client.query(
      'SELECT gender FROM users WHERE id = $1',
      [fromUserId]
    );
    if (fromUserRows.length === 0) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');

    const { rows: toUserRows } = await client.query(
      'SELECT gender FROM users WHERE id = $1',
      [toUserId]
    );
    if (toUserRows.length === 0) throw new AppError(404, 'Target user not found', 'USER_NOT_FOUND');

    // Apply gender pairing rules when configured (defaults to male_to_female per MVP spec).
    // Set REQUEST_GENDER_PAIRING=open to disable gender-based restrictions.
    if (config.requests.genderPairing === 'male_to_female') {
      if (fromUserRows[0].gender !== 'male') {
        throw new AppError(403, 'Only male users can send requests in this mode', 'GENDER_RESTRICTION');
      }
      if (toUserRows[0].gender !== 'female') {
        throw new AppError(403, 'Requests can only be sent to female users in this mode', 'GENDER_RESTRICTION');
      }
    }

    const { rows: existingReq } = await client.query(
      `SELECT id FROM requests WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`,
      [fromUserId, toUserId]
    );
    if (existingReq.length > 0) {
      throw new AppError(409, 'Pending request already exists', 'REQUEST_EXISTS');
    }

    const requestId = uuidv4();
    const escrowKey = `escrow-request-${requestId}`;
    const expiresAt = new Date(Date.now() + config.tokens.requestExpiryHours * 3600 * 1000);

    const escrowId = await reserveTokens(
      client,
      fromUserId,
      tokenAmount,
      requestId,
      'request',
      escrowKey
    );

    const { rows } = await client.query(
      `INSERT INTO requests 
       (id, from_user_id, to_user_id, token_amount, escrow_id, status, message, expires_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
       RETURNING *`,
      [requestId, fromUserId, toUserId, tokenAmount, escrowId, message || null, expiresAt, idempotencyKey || null]
    );

    return rows[0];
  });
}

export async function respondToRequest(
  requestId: string,
  toUserId: string,
  action: 'accept' | 'reject'
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM requests WHERE id = $1 FOR UPDATE',
      [requestId]
    );
    if (rows.length === 0) throw new AppError(404, 'Request not found', 'REQUEST_NOT_FOUND');

    const req = rows[0];
    if (req.to_user_id !== toUserId) throw new AppError(403, 'Not authorized', 'UNAUTHORIZED');
    if (req.status !== 'pending') {
      throw new AppError(409, `Request already ${req.status}`, 'REQUEST_ALREADY_RESOLVED');
    }
    if (new Date(req.expires_at) < new Date()) {
      throw new AppError(409, 'Request has expired', 'REQUEST_EXPIRED');
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';

    await client.query(
      'UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, requestId]
    );

    if (action === 'accept') {
      await finalizeEscrow(client, req.escrow_id, toUserId, requestId);

      const p1 = req.from_user_id < toUserId ? req.from_user_id : toUserId;
      const p2 = req.from_user_id < toUserId ? toUserId : req.from_user_id;

      await client.query(
        `INSERT INTO conversations (participant1_id, participant2_id, request_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (participant1_id, participant2_id) DO NOTHING`,
        [p1, p2, requestId]
      );
    } else {
      await releaseEscrow(client, req.escrow_id);
    }

    return { requestId, status: newStatus };
  });
}

export async function cancelRequest(requestId: string, fromUserId: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM requests WHERE id = $1 FOR UPDATE',
      [requestId]
    );
    if (rows.length === 0) throw new AppError(404, 'Request not found', 'REQUEST_NOT_FOUND');

    const req = rows[0];
    if (req.from_user_id !== fromUserId) throw new AppError(403, 'Not authorized', 'UNAUTHORIZED');
    if (req.status !== 'pending') {
      throw new AppError(409, `Request already ${req.status}`, 'REQUEST_ALREADY_RESOLVED');
    }

    await client.query(
      "UPDATE requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [requestId]
    );

    await releaseEscrow(client, req.escrow_id);

    return { requestId, status: 'cancelled' };
  });
}

export async function getMyRequests(userId: string, direction: 'sent' | 'received') {
  const col = direction === 'sent' ? 'from_user_id' : 'to_user_id';
  const { rows } = await query(
    `SELECT r.*, 
       p_from.display_name as from_display_name,
       p_to.display_name as to_display_name
     FROM requests r
     JOIN profiles p_from ON p_from.user_id = r.from_user_id
     JOIN profiles p_to ON p_to.user_id = r.to_user_id
     WHERE r.${col} = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function expireStaleRequests() {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT r.id, r.escrow_id FROM requests r
       WHERE r.status = 'pending' AND r.expires_at < NOW()
       FOR UPDATE SKIP LOCKED`,
      []
    );

    for (const req of rows) {
      await client.query(
        "UPDATE requests SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [req.id]
      );
      if (req.escrow_id) {
        await releaseEscrow(client, req.escrow_id);
      }
    }

    return { expired: rows.length };
  });
}
