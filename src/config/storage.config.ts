import { z } from 'zod';

import { env } from './env.config.js';

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

if (!parsedCloudinaryEnvironment.success) {
  const missingFields = parsedCloudinaryEnvironment.error.issues
    .map((issue) => issue.path.join('.'))
    .join(', ');

  throw new Error(`Invalid Cloudinary configuration: ${missingFields}`);
}

export const storageConfig = Object.freeze({
  provider: 'cloudinary' as const,
  cloudinary: Object.freeze({
    cloudName: parsedCloudinaryEnvironment.data.cloudName,
    apiKey: parsedCloudinaryEnvironment.data.apiKey,
    apiSecret: parsedCloudinaryEnvironment.data.apiSecret,
    uploadFolder: parsedCloudinaryEnvironment.data.uploadFolder,
    secure: true,
  }),
});
