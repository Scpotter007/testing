import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler.middleware';
import { creditTokens } from '../wallet/wallet.service';
import { createQRToken, generateQRCode, parseQRPayload } from '../../utils/qr';
import { hashToken } from '../../utils/crypto';
import { haversineDistance } from '../../utils/geo';

export async function initiateMeetup(initiatorId: string, partnerId: string) {
  const { token, hash, expiresAt } = createQRToken();

  // Only store the hash — never persist the plaintext token in the database.
  // The plaintext token lives only in the QR code payload delivered to the client.
  const { rows } = await query(
    `INSERT INTO meetups (initiator_id, partner_id, qr_token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, initiator_id, partner_id, status, expires_at`,
    [initiatorId, partnerId, hash, expiresAt]
  );

  const meetup = rows[0];

  const qrDataUrl = await generateQRCode({
    token,
    meetupId: meetup.id,
    initiatorId,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    meetupId: meetup.id,
    qrDataUrl,
    expiresAt: meetup.expires_at,
  };
}

export async function verifyMeetup(
  qrPayloadRaw: string,
  scannerId: string,
  scannerLat: number,
  scannerLng: number
) {
  const payload = parseQRPayload(qrPayloadRaw);
  const { token, meetupId } = payload;

  if (!token || !meetupId) {
    throw new AppError(400, 'Invalid QR payload', 'INVALID_QR');
  }

  const tokenHash = hashToken(token);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM meetups WHERE id = $1 FOR UPDATE',
      [meetupId]
    );

    if (rows.length === 0) throw new AppError(404, 'Meetup not found', 'MEETUP_NOT_FOUND');

    const meetup = rows[0];

    if (meetup.qr_token_hash !== tokenHash) {
      throw new AppError(400, 'Invalid QR token', 'INVALID_QR_TOKEN');
    }

    if (meetup.partner_id !== scannerId) {
      throw new AppError(403, 'Not authorized to verify this meetup', 'UNAUTHORIZED');
    }

    if (meetup.status !== 'pending') {
      if (meetup.status === 'verified') {
        throw new AppError(409, 'Meetup already verified', 'ALREADY_VERIFIED');
      }
      throw new AppError(409, `Meetup is ${meetup.status}`, 'MEETUP_RESOLVED');
    }

    if (new Date(meetup.expires_at) < new Date()) {
      await client.query(
        "UPDATE meetups SET status = 'expired' WHERE id = $1",
        [meetupId]
      );
      throw new AppError(400, 'QR code has expired', 'QR_EXPIRED');
    }

    const initiatorLat = meetup.initiator_lat;
    const initiatorLng = meetup.initiator_lng;

    let distanceMeters: number | null = null;
    if (initiatorLat !== null && initiatorLng !== null) {
      distanceMeters = haversineDistance(initiatorLat, initiatorLng, scannerLat, scannerLng);
      if (distanceMeters > config.distance.meetingProximityMeters) {
        throw new AppError(
          400,
          `Users must be within ${config.distance.meetingProximityMeters}m. Current distance: ${Math.round(distanceMeters)}m`,
          'TOO_FAR_APART'
        );
      }
    }

    await client.query(
      `UPDATE meetups SET 
         status = 'verified', 
         partner_lat = $1, partner_lng = $2,
         distance_meters = $3,
         verified_at = NOW()
       WHERE id = $4`,
      [scannerLat, scannerLng, distanceMeters, meetupId]
    );

    const user1Id = meetup.initiator_id < scannerId ? meetup.initiator_id : scannerId;
    const user2Id = meetup.initiator_id < scannerId ? scannerId : meetup.initiator_id;
    const rewardIdempotencyKey = `meeting-reward-${user1Id}-${user2Id}`;

    const { rows: rewardCheck } = await client.query(
      'SELECT id FROM meeting_rewards WHERE user1_id = $1 AND user2_id = $2',
      [user1Id, user2Id]
    );

    let rewardGranted = false;
    if (rewardCheck.length === 0) {
      const rewardAmount = config.tokens.meetingReward;

      await creditTokens(
        client,
        meetup.initiator_id,
        rewardAmount,
        'meeting_reward',
        meetupId,
        'meetup',
        `First meeting reward with user ${scannerId}`,
        `${rewardIdempotencyKey}-initiator`
      );

      await creditTokens(
        client,
        scannerId,
        rewardAmount,
        'meeting_reward',
        meetupId,
        'meetup',
        `First meeting reward with user ${meetup.initiator_id}`,
        `${rewardIdempotencyKey}-scanner`
      );

      await client.query(
        `INSERT INTO meeting_rewards (user1_id, user2_id, meetup_id, idempotency_key)
         VALUES ($1, $2, $3, $4)`,
        [user1Id, user2Id, meetupId, rewardIdempotencyKey]
      );

      rewardGranted = true;
    }

    return {
      meetupId,
      status: 'verified',
      rewardGranted,
      rewardAmount: rewardGranted ? config.tokens.meetingReward : 0,
      distanceMeters,
    };
  });
}

export async function updateInitiatorLocation(
  meetupId: string,
  initiatorId: string,
  lat: number,
  lng: number
) {
  const { rows } = await query(
    'SELECT * FROM meetups WHERE id = $1 AND initiator_id = $2',
    [meetupId, initiatorId]
  );
  if (rows.length === 0) throw new AppError(404, 'Meetup not found', 'MEETUP_NOT_FOUND');
  if (rows[0].status !== 'pending') throw new AppError(409, 'Meetup already resolved', 'MEETUP_RESOLVED');

  await query(
    'UPDATE meetups SET initiator_lat = $1, initiator_lng = $2 WHERE id = $3',
    [lat, lng, meetupId]
  );
  return { meetupId, initiatorLat: lat, initiatorLng: lng };
}

export async function getMeetupHistory(userId: string) {
  const { rows } = await query(
    `SELECT m.*, 
       pi.display_name as initiator_name,
       pp.display_name as partner_name
     FROM meetups m
     JOIN profiles pi ON pi.user_id = m.initiator_id
     JOIN profiles pp ON pp.user_id = m.partner_id
     WHERE m.initiator_id = $1 OR m.partner_id = $1
     ORDER BY m.created_at DESC`,
    [userId]
  );
  return rows;
}
