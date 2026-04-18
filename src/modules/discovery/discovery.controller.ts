import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { getDiscoveryFeed } from './discovery.service';
import { AppError } from '../../middleware/errorHandler.middleware';

export async function getFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      throw new AppError(400, 'lat and lng query parameters are required', 'MISSING_LOCATION');
    }

    const filters = {
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const feed = await getDiscoveryFeed(
      req.user!.userId,
      req.user!.gender,
      lat,
      lng,
      filters
    );

    res.json({ profiles: feed, count: feed.length });
  } catch (err) {
    next(err);
  }
}
