import { Router } from 'express';
import { query as qv } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { getFeed } from './discovery.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  [
    qv('lat').isFloat({ min: -90, max: 90 }),
    qv('lng').isFloat({ min: -180, max: 180 }),
    qv('limit').optional().isInt({ min: 1, max: 50 }),
    qv('offset').optional().isInt({ min: 0 }),
  ],
  getFeed
);

export default router;
