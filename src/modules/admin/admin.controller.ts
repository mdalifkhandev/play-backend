import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { adminService } from './admin.service.js';

export class AdminController {
  dashboardSummary = asyncHandler(async (_request: Request, response: Response) => {
    const result = await adminService.getDashboardSummary();
    return sendSuccess(response, 200, 'Admin dashboard summary retrieved successfully.', result);
  });
}

export const adminController = new AdminController();
