import type { RequestHandler } from 'express';

import { auditService } from './audit.service.js';

const authActionByPath: Readonly<Record<string, string>> = Object.freeze({
  '/sign-up': 'auth.sign_up',
  '/login': 'auth.login',
  '/verify-email': 'auth.verify_email',
  '/resend-verification': 'auth.resend_verification',
  '/forgot-password': 'auth.forgot_password',
  '/verify-reset-code': 'auth.verify_reset_code',
  '/reset-password': 'auth.reset_password',
  '/refresh': 'auth.refresh_token',
  '/logout': 'auth.logout',
  '/me': 'auth.get_me',
  '/setup-profile': 'auth.setup_profile',
});

export const authAuditMiddleware: RequestHandler = (request, response, next) => {
  response.once('finish', () => {
    const action = authActionByPath[request.path];

    if (!action) {
      return;
    }

    const userAgent = request.get('user-agent');

    void auditService.record({
      action,
      outcome: response.statusCode < 400 ? 'success' : 'failure',
      ...(request.user?.userId ? { actorUserId: request.user.userId } : {}),
      ...(request.id ? { requestId: request.id } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(userAgent ? { userAgent } : {}),
      method: request.method,
      path: request.originalUrl,
      statusCode: response.statusCode,
    });
  });

  next();
};
