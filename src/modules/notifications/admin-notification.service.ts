import { UserRole } from '../../common/enums/user-role.enum.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { UserModel } from '../users/user.model.js';
import { notificationRepository } from './notification.repository.js';

export type AdminNotificationEvent =
  | 'creator_application_submitted'
  | 'ad_campaign_submitted'
  | 'withdrawal_request_submitted'
  | 'moderation_report_submitted'
  | 'support_request_submitted'
  | 'support_request_user_replied'
  | 'live_recording_failed'
  | 'reel_processing_failed';

export interface AdminNotificationInput {
  event: AdminNotificationEvent;
  title: string;
  body: string;
  relatedEntityId?: string;
}

export class AdminNotificationService {
  async notifyAdmins(input: AdminNotificationInput): Promise<void> {
    try {
      const admins = await UserModel.find({ role: { $in: [UserRole.ADMIN, UserRole.MODERATOR] } })
        .select('_id')
        .lean<{ _id: { toString(): string } }[]>()
        .exec();

      if (admins.length === 0) {
        logger.warn({ event: input.event }, 'Admin notification skipped because no admin users were found');
        return;
      }

      await Promise.all(
        admins.map((admin) =>
          notificationRepository.createNotification({
            userId: admin._id as any,
            type: 'system',
            title: input.title,
            body: input.body,
            ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId as any } : {}),
            data: {
              event: input.event,
              adminPage: adminPageForEvent(input.event),
              ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
            },
          }),
        ),
      );
    } catch (error) {
      logger.error({ err: error, event: input.event }, 'Failed to create admin notification');
    }
  }
}

export const adminNotificationService = new AdminNotificationService();

function adminPageForEvent(event: AdminNotificationEvent): string {
  if (event === 'creator_application_submitted') return 'creators';
  if (event === 'ad_campaign_submitted') return 'ads';
  if (event === 'withdrawal_request_submitted') return 'withdrawals';
  if (event === 'moderation_report_submitted') return 'moderation';
  if (event === 'support_request_submitted' || event === 'support_request_user_replied') return 'settings';
  if (event === 'live_recording_failed') return 'live';
  if (event === 'reel_processing_failed') return 'moderation';
  return 'dashboard';
}
