import { Router } from 'express';
import { body } from 'express-validator';
import { register, login } from './auth.controller';
import { authRateLimit } from '../../middleware/rateLimit.middleware';

const router = Router();

router.post(
  '/register',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('gender').isIn(['male', 'female', 'other']),
    body('displayName').trim().isLength({ min: 1, max: 100 }),
    body('birthdate').optional().isISO8601(),
  ],
  register
);

router.post(
  '/login',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  login
);

export default router;
