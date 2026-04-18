import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { sendRequest, respondRequest, cancelMyRequest, listRequests } from './requests.controller';

const router = Router();

router.get('/', authenticate, listRequests);
router.post(
  '/',
  authenticate,
  [
    body('toUserId').isUUID(),
    body('tokenAmount').isInt({ min: 1 }),
    body('message').optional().isString().isLength({ max: 500 }),
    body('idempotencyKey').optional().isString(),
  ],
  sendRequest
);
router.post(
  '/:requestId/respond',
  authenticate,
  [
    param('requestId').isUUID(),
    body('action').isIn(['accept', 'reject']),
  ],
  respondRequest
);
router.delete(
  '/:requestId',
  authenticate,
  [param('requestId').isUUID()],
  cancelMyRequest
);

export default router;
