import type { UserRole } from '../enums/user-role.enum.js';

export interface AccessTokenPayload {
  type: 'access';
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}
