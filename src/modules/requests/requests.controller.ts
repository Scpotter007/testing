import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import {
  createRequest,
  respondToRequest,
  cancelRequest,
  getMyRequests,
} from './requests.service';

export async function sendRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { toUserId, tokenAmount, message, idempotencyKey } = req.body;
    const result = await createRequest(
      req.user!.userId,
      toUserId,
      tokenAmount,
      message,
      idempotencyKey
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function respondRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { action } = req.body;
    const result = await respondToRequest(req.params.requestId, req.user!.userId, action);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function cancelMyRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await cancelRequest(req.params.requestId, req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const direction = (req.query.direction as 'sent' | 'received') || 'received';
    const requests = await getMyRequests(req.user!.userId, direction);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}
