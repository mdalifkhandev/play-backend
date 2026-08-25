import type { Request, Response } from 'express';

import { adminContentService } from './admin-content.service.js';

class AdminContentController {
  async list(request: Request, response: Response) {
    const result = await adminContentService.list(request.query as any);
    response.status(200).json({
      success: true,
      message: 'Admin content retrieved.',
      data: result,
    });
  }

  async update(request: Request, response: Response) {
    const result = await adminContentService.update(request.params as any, request.body);
    response.status(200).json({
      success: true,
      message: 'Content updated.',
      data: result,
    });
  }

  async remove(request: Request, response: Response) {
    const result = await adminContentService.remove(request.params as any);
    response.status(200).json({
      success: true,
      message: 'Content removed.',
      data: result,
    });
  }

  async restore(request: Request, response: Response) {
    const result = await adminContentService.restore(request.params as any);
    response.status(200).json({
      success: true,
      message: 'Content restored.',
      data: result,
    });
  }
}

export const adminContentController = new AdminContentController();

