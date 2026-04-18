import { query } from '../../db';
import { AppError } from '../../middleware/errorHandler.middleware';

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  birthdate?: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  preferences?: Record<string, any>;
}

export async function getProfile(userId: string) {
  const { rows } = await query(
    `SELECT p.*, u.email, u.gender, u.created_at as member_since,
            ST_X(p.location::geometry) as lng_val,
            ST_Y(p.location::geometry) as lat_val
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );
  if (rows.length === 0) {
    throw new AppError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
  }
  const profile = rows[0];
  return {
    ...profile,
    lat: profile.lat_val,
    lng: profile.lng_val,
    location: undefined,
    lat_val: undefined,
    lng_val: undefined,
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const sets: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let idx = 1;

  if (input.displayName !== undefined) {
    sets.push(`display_name = $${idx++}`);
    values.push(input.displayName);
  }
  if (input.bio !== undefined) {
    sets.push(`bio = $${idx++}`);
    values.push(input.bio);
  }
  if (input.birthdate !== undefined) {
    sets.push(`birthdate = $${idx++}`);
    values.push(input.birthdate);
  }
  if (input.lat !== undefined && input.lng !== undefined) {
    sets.push(`location = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
    values.push(input.lng, input.lat);
  }
  if (input.city !== undefined) {
    sets.push(`city = $${idx++}`);
    values.push(input.city);
  }
  if (input.country !== undefined) {
    sets.push(`country = $${idx++}`);
    values.push(input.country);
  }
  if (input.preferences !== undefined) {
    sets.push(`preferences = $${idx++}`);
    values.push(JSON.stringify(input.preferences));
  }

  values.push(userId);
  const { rows } = await query(
    `UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

export async function addProfilePhoto(userId: string, photoUrl: string) {
  const { rows } = await query(
    `UPDATE profiles 
     SET photos = photos || $1::jsonb, updated_at = NOW()
     WHERE user_id = $2
     RETURNING photos`,
    [JSON.stringify([photoUrl]), userId]
  );
  return rows[0];
}
