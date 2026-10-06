import { v2 as cloudinary } from 'cloudinary';

import { storageConfig } from '../../config/storage.config.js';

cloudinary.config({
  cloud_name: storageConfig.cloudinary.cloudName,
  api_key: storageConfig.cloudinary.apiKey,
  api_secret: storageConfig.cloudinary.apiSecret,
  secure: storageConfig.cloudinary.secure,
});

export const cloudinaryClient = cloudinary;
