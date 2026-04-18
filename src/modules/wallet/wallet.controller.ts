import { Request, Response, NextFunction } from 'express';
import { getWallet, getLedger, purchaseTokens } from './wallet.service';

export async function myWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = await getWallet(req.user!.userId);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
}

export async function myLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const entries = await getLedger(req.user!.userId, limit, offset);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
}

export async function buyTokens(req: Request, res: Response, next: NextFunction) {
  try {
    const { amountCents, tokenAmount, currency } = req.body;
    const result = await purchaseTokens(req.user!.userId, amountCents, tokenAmount, currency);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
