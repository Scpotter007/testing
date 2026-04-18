import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { initiateMeetup, verifyMeetupQR, setInitiatorLocation, meetupHistory } from './meetups.controller';
import { strictRateLimit } from '../../middleware/rateLimit.middleware';

const router = Router();

router.get('/history', authenticate, meetupHistory);
router.post(
  '/',
  authenticate,
  strictRateLimit,
  [body('partnerId').isUUID()],
  initiateMeetup
);
router.post(
  '/verify',
  authenticate,
  strictRateLimit,
  [
    body('qrPayload').isString().notEmpty(),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
  ],
  verifyMeetupQR
);
router.patch(
  '/:meetupId/location',
  authenticate,
  [
    param('meetupId').isUUID(),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
  ],
  setInitiatorLocation
);

export default router;
