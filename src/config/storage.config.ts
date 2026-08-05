import { z } from 'zod';

import { env } from './env.config.js';
import { AppError } from '../common/errors/app-error.js';

const cloudinaryEnvironmentSchema = z.object({
  cloudName: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  apiSecret: z.string().trim().min(1),
  uploadFolder: z.string().trim().min(1),
});

const parsedCloudinaryEnvironment = cloudinaryEnvironmentSchema.safeParse({
  cloudName: env.CLOUDINARY_CLOUD_NAME,
  apiKey: env.CLOUDINARY_API_KEY,
  apiSecret: env.CLOUDINARY_API_SECRET,
  uploadFolder: env.CLOUDINARY_UPLOAD_FOLDER,
});

const fallbackCloudinaryConfig = {
  cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
  apiKey: env.CLOUDINARY_API_KEY ?? '',
  apiSecret: env.CLOUDINARY_API_SECRET ?? '',
  uploadFolder: env.CLOUDINARY_UPLOAD_FOLDER,
};

export function assertCloudinaryConfigured(): void {
  if (parsedCloudinaryEnvironment.success) {
    return;
  }

  const missingFields = parsedCloudinaryEnvironment.error.issues
    .map((issue) => issue.path.join('.'))
    .join(', ');

  throw new AppError('Cloudinary storage is not configured.', 503, {
    code: 'CLOUDINARY_NOT_CONFIGURED',
    details: { missingFields },
  });
}

export const storageConfig = Object.freeze({
  provider: 'cloudinary' as const,
  cloudinary: Object.freeze({
    cloudName: parsedCloudinaryEnvironment.success
      ? parsedCloudinaryEnvironment.data.cloudName
      : fallbackCloudinaryConfig.cloudName,
    apiKey: parsedCloudinaryEnvironment.success
      ? parsedCloudinaryEnvironment.data.apiKey
      : fallbackCloudinaryConfig.apiKey,
    apiSecret: parsedCloudinaryEnvironment.success
      ? parsedCloudinaryEnvironment.data.apiSecret
      : fallbackCloudinaryConfig.apiSecret,
    uploadFolder: parsedCloudinaryEnvironment.success
      ? parsedCloudinaryEnvironment.data.uploadFolder
      : fallbackCloudinaryConfig.uploadFolder,
    secure: true,
  }),
});
