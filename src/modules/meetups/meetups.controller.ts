import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import {
  inititateMeetup,
  verifyMeetup,
  updateInitiatorLocation,
  getMeetupHistory,
} from './meetups.service';

export async function initiateMeetup(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { partnerId } = req.body;
    const result = await inititateMeetup(req.user!.userId, partnerId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function verifyMeetupQR(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { qrPayload, lat, lng } = req.body;
    const result = await verifyMeetup(qrPayload, req.user!.userId, lat, lng);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function setInitiatorLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { lat, lng } = req.body;
    const result = await updateInitiatorLocation(req.params.meetupId, req.user!.userId, lat, lng);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function meetupHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await getMeetupHistory(req.user!.userId);
    res.json({ meetups: history });
  } catch (err) {
    next(err);
  }
}
