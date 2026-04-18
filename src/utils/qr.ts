import QRCode from 'qrcode';
import { generateSecureToken, hashToken } from './crypto';
import { config } from '../config';

export interface QRPayload {
  token: string;
  meetupId: string;
  initiatorId: string;
  expiresAt: string;
}

export async function generateQRCode(payload: QRPayload): Promise<string> {
  const jsonPayload = JSON.stringify(payload);
  return QRCode.toDataURL(jsonPayload);
}

export function createQRToken(): { token: string; hash: string; expiresAt: Date } {
  const token = generateSecureToken(32);
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.qr.tokenTtlSeconds * 1000);
  return { token, hash, expiresAt };
}

export function parseQRPayload(raw: string): QRPayload {
  try {
    return JSON.parse(raw) as QRPayload;
  } catch {
    throw new Error('Invalid QR payload');
  }
}
