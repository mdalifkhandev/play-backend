import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '../enums/user-role.enum.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';

export function authorize(...allowedRoles: readonly UserRole[]) {
  const allowedRoleSet = new Set<UserRole>(allowedRoles);

  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(
        new UnauthorizedError('Authentication is required.', {
          code: 'AUTHENTICATION_REQUIRED',
        }),
      );
      return;
    }

    if (!allowedRoleSet.has(request.user.role)) {
      next(
        new ForbiddenError('You do not have permission to perform this action.', {
          code: 'INSUFFICIENT_PERMISSION',
        }),
      );
      return;
    }

    next();
  };
}
