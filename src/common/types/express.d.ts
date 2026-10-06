import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface.js';

export {};

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: AuthenticatedUser;
    }
  }
}
