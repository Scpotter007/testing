import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { myWallet, myLedger, buyTokens } from './wallet.controller';

const router = Router();

router.get('/me', authenticate, myWallet);
router.get('/ledger', authenticate, myLedger);
router.post(
  '/purchase',
  authenticate,
  [
    body('amountCents').isInt({ min: 1 }),
    body('tokenAmount').isInt({ min: 1 }),
    body('currency').optional().isString().isLength({ max: 10 }),
  ],
  buyTokens
);

export default router;
