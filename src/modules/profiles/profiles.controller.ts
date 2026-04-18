import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { getProfile, updateProfile } from './profiles.service';

export async function getMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getProfile(req.user!.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function getUserProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getProfile(req.params.userId);
    const { password_hash, ...safe } = profile as any;
    res.json(safe);
  } catch (err) {
    next(err);
  }
}

export async function updateMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const profile = await updateProfile(req.user!.userId, req.body);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}
