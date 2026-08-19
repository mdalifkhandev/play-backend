import { Types } from 'mongoose';
import { activityRepository } from './activity.repository.js';
import type { ActivityType, EntityModel } from './activity.model.js';

export class ActivityService {
  async logActivity(params: {
    userId: string | Types.ObjectId;
    actorId?: string | Types.ObjectId;
    actionType: ActivityType;
    entityId?: string | Types.ObjectId;
    entityModel?: EntityModel;
    metadata?: Record<string, any>;
  }) {
    try {
      const parsedParams: Partial<import('./activity.model.js').Activity> = {
        userId: new Types.ObjectId(params.userId.toString()),
        actionType: params.actionType,
      };
      if (params.actorId) parsedParams.actorId = new Types.ObjectId(params.actorId.toString());
      if (params.entityId) parsedParams.entityId = new Types.ObjectId(params.entityId.toString());
      if (params.entityModel) parsedParams.entityModel = params.entityModel;
      if (params.metadata) parsedParams.metadata = params.metadata;

      await activityRepository.create(parsedParams);
    } catch (error) {
      // Non-blocking log, so just console error if it fails
      console.error('Failed to log activity:', error);
    }
  }

  async getActivities(userId: string | Types.ObjectId, days?: number) {
    return activityRepository.listUserActivities(userId, days);
  }
}

export const activityService = new ActivityService();
