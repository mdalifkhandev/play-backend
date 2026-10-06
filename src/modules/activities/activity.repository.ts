import type { Types } from 'mongoose';
import { ActivityModel, type Activity, type ActivityDocument } from './activity.model.js';

export class ActivityRepository {
  async create(input: Partial<Activity>): Promise<ActivityDocument> {
    return ActivityModel.create(input);
  }

  async listUserActivities(
    userId: string | Types.ObjectId,
    daysAgo?: number,
    limit: number = 50,
  ): Promise<ActivityDocument[]> {
    const query: any = { userId };
    
    if (daysAgo) {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      query.createdAt = { $gte: date };
    }

    // Populate actorId to get username and avatar
    // Populate entityId if it's a Reel, Comment, etc.
    return ActivityModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actorId', 'profile.username profile.displayName profile.photoUrl')
      .populate('entityId')
      .exec();
  }
}

export const activityRepository = new ActivityRepository();
