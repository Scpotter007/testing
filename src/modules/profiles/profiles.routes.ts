import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { getMyProfile, getUserProfile, updateMyProfile } from './profiles.controller';

const router = Router();

router.get('/me', authenticate, getMyProfile);
router.get('/:userId', authenticate, getUserProfile);
router.patch(
  '/me',
  authenticate,
  [
    body('displayName').optional().trim().isLength({ min: 1, max: 100 }),
    body('bio').optional().isString(),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('city').optional().isString(),
    body('country').optional().isString(),
    body('birthdate').optional().isISO8601(),
  ],
  updateMyProfile
);

export default router;
