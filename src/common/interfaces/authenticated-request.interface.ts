import type { Request } from 'express';

import type { UserRole } from '../enums/user-role.enum.js';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
