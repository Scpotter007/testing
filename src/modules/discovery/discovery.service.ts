import { query } from '../../db';
import { config } from '../../config';

export interface DiscoveryFilter {
  minAge?: number;
  maxAge?: number;
  limit?: number;
  offset?: number;
}

export async function getDiscoveryFeed(
  userId: string,
  userGender: string,
  lat: number,
  lng: number,
  filters: DiscoveryFilter = {}
) {
  const { limit = 20, offset = 0 } = filters;
  const radiusMeters = config.distance.discoveryRadiusMeters;

  let genderFilter = '';
  const params: any[] = [userId, lng, lat, radiusMeters, limit, offset];

  if (userGender === 'male') {
    genderFilter = `AND u.gender = 'female'`;
  } else if (userGender === 'female') {
    genderFilter = `AND u.gender = 'male'`;
  }

  const { rows } = await query(
    `SELECT 
       p.user_id,
       p.display_name,
       p.bio,
       p.birthdate,
       p.city,
       p.country,
       p.photos,
       u.gender,
       ROUND(ST_Distance(
         p.location::geography,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
       )::numeric, 0) AS distance_meters
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id != $1
       AND p.location IS NOT NULL
       AND u.is_active = true
       ${genderFilter}
       AND ST_DWithin(
         p.location::geography,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
         $4
       )
     ORDER BY distance_meters ASC
     LIMIT $5 OFFSET $6`,
    params
  );

  return rows;
}
