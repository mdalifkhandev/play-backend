import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { announcementService } from './announcement.service.js';
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from './announcement.validation.js';

export class AnnouncementController {
  listActive = asyncHandler(async (request: Request, response: Response) => {
    const result = await announcementService.listActive(request.user?.userId);
    return sendSuccess(response, 200, 'Announcements retrieved successfully.', result);
  });

  listAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await announcementService.listAdmin(request.query as unknown as ListAnnouncementsQuery);
    return sendSuccess(response, 200, 'Admin announcements retrieved successfully.', result);
  });

  create = asyncHandler(async (request: Request, response: Response) => {
    const adminUserId = request.user!.userId;
    const result = await announcementService.create(adminUserId, request.body as CreateAnnouncementInput);
    return sendSuccess(response, 201, 'Announcement created successfully.', result);
  });

  update = asyncHandler(async (request: Request, response: Response) => {
    const adminUserId = request.user!.userId;
    const { announcementId } = request.params as { announcementId: string };
    const result = await announcementService.update(
      adminUserId,
      announcementId,
      request.body as UpdateAnnouncementInput,
    );
    return sendSuccess(response, 200, 'Announcement updated successfully.', result);
  });

  delete = asyncHandler(async (request: Request, response: Response) => {
    const { announcementId } = request.params as { announcementId: string };
    const result = await announcementService.delete(announcementId);
    return sendSuccess(response, 200, 'Announcement deleted successfully.', result);
  });
}

export const announcementController = new AnnouncementController();
