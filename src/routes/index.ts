import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.route.js';
import { healthRouter } from './health.route.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
