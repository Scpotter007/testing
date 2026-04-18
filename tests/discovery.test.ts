import { haversineDistance, isWithinDistance } from '../src/utils/geo';

describe('Geospatial utilities', () => {
  const NYC_LAT = 40.7128;
  const NYC_LNG = -74.006;
  const CLOSE_LAT = 40.7218;
  const CLOSE_LNG = -74.006;
  const LONDON_LAT = 51.5074;
  const LONDON_LNG = -0.1278;

  it('should calculate distance between same points as 0', () => {
    const dist = haversineDistance(NYC_LAT, NYC_LNG, NYC_LAT, NYC_LNG);
    expect(dist).toBe(0);
  });

  it('should calculate ~1km distance correctly', () => {
    const dist = haversineDistance(NYC_LAT, NYC_LNG, CLOSE_LAT, CLOSE_LNG);
    expect(dist).toBeGreaterThan(900);
    expect(dist).toBeLessThan(1100);
  });

  it('should calculate NYC to London as ~5500km', () => {
    const dist = haversineDistance(NYC_LAT, NYC_LNG, LONDON_LAT, LONDON_LNG);
    expect(dist).toBeGreaterThan(5_400_000);
    expect(dist).toBeLessThan(5_700_000);
  });

  it('should correctly identify points within 20km', () => {
    expect(isWithinDistance(NYC_LAT, NYC_LNG, CLOSE_LAT, CLOSE_LNG, 20000)).toBe(true);
  });

  it('should correctly identify points outside 20km (London from NYC)', () => {
    expect(isWithinDistance(NYC_LAT, NYC_LNG, LONDON_LAT, LONDON_LNG, 20000)).toBe(false);
  });

  it('should correctly identify proximity within 20 meters', () => {
    const lat1 = 40.7128;
    const lng1 = -74.006;
    const lat2 = 40.71293;
    const lng2 = -74.006;
    expect(isWithinDistance(lat1, lng1, lat2, lng2, 20)).toBe(true);
  });

  it('should correctly reject proximity beyond 20 meters', () => {
    const lat1 = 40.7128;
    const lng1 = -74.006;
    const lat2 = 40.7130;
    const lng2 = -74.006;
    expect(isWithinDistance(lat1, lng1, lat2, lng2, 20)).toBe(false);
  });
});
