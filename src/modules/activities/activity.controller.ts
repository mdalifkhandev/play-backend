import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { activityService } from './activity.service.js';

export class ActivityController {
  getActivities = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { days } = request.query;
    
    let daysAgo: number | undefined = undefined;
    if (days && typeof days === 'string') {
      const parsedDays = parseInt(days.replace('days', '').trim(), 10);
      if (!isNaN(parsedDays)) {
        daysAgo = parsedDays;
      }
    }

    const activities = await activityService.getActivities(userId, daysAgo);

    return sendSuccess(response, 200, 'Activities retrieved successfully', { items: activities });
  });
}

export const activityController = new ActivityController();
