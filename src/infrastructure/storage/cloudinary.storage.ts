import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';

import { storageConfig } from '../../config/storage.config.js';
import { cloudinaryClient } from './cloudinary.client.js';
import type {
  StorageDeleteOptions,
  StorageDeleteResult,
  StorageProvider,
  StorageResourceType,
  StorageUploadOptions,
  StoredAsset,
} from './storage.interface.js';

export class CloudinaryStorage implements StorageProvider {
  async upload(
    source: string,
    options: StorageUploadOptions = {},
  ): Promise<StoredAsset> {
    if (!source.trim()) {
      throw new TypeError('Upload source must not be empty.');
    }

    const result = await cloudinaryClient.uploader.upload(
      source,
      this.buildUploadOptions(options),
    );

    return this.toStoredAsset(result);
  }

  async uploadBuffer(
    buffer: Buffer,
    options: StorageUploadOptions = {},
  ): Promise<StoredAsset> {
    if (buffer.length === 0) {
      throw new TypeError('Upload buffer must not be empty.');
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinaryClient.uploader.upload_stream(
        this.buildUploadOptions(options),
        (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          if (!uploadResult) {
            reject(new Error('Cloudinary upload completed without a result.'));
            return;
          }

          resolve(uploadResult);
        },
      );

      uploadStream.end(buffer);
    });

    return this.toStoredAsset(result);
  }

  async deleteAsset(
    publicId: string,
    options: StorageDeleteOptions = {},
  ): Promise<StorageDeleteResult> {
    if (!publicId.trim()) {
      throw new TypeError('Cloudinary public ID must not be empty.');
    }

    const result = await cloudinaryClient.uploader.destroy(publicId, {
      resource_type: options.resourceType ?? 'image',
      invalidate: options.invalidate ?? true,
      type: 'upload',
    });

    if (result.result === 'ok') {
      return { status: 'deleted' };
    }

    if (result.result === 'not found') {
      return { status: 'not-found' };
    }

    throw new Error(`Cloudinary could not delete asset: ${result.result}`);
  }

  private buildUploadOptions(options: StorageUploadOptions): UploadApiOptions {
    return {
      folder: options.folder ?? storageConfig.cloudinary.uploadFolder,
      resource_type: options.resourceType ?? 'auto',
      overwrite: options.overwrite ?? false,
      unique_filename: options.publicId === undefined,
      use_filename: false,
      ...(options.publicId ? { public_id: options.publicId } : {}),
      ...(options.tags?.length ? { tags: [...options.tags] } : {}),
    };
  }

  private toStoredAsset(result: UploadApiResponse): StoredAsset {
    return {
      assetId: result.asset_id,
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: this.toStorageResourceType(result.resource_type),
      bytes: result.bytes,
      version: result.version,
      createdAt: result.created_at,
      ...(result.format ? { format: result.format } : {}),
      ...(typeof result.width === 'number' ? { width: result.width } : {}),
      ...(typeof result.height === 'number' ? { height: result.height } : {}),
      ...(typeof result.duration === 'number' ? { duration: result.duration } : {}),
    };
  }

  private toStorageResourceType(resourceType: string): StorageResourceType {
    if (resourceType === 'image' || resourceType === 'video' || resourceType === 'raw') {
      return resourceType;
    }

    throw new Error(`Unsupported Cloudinary resource type: ${resourceType}`);
  }
}

export const cloudinaryStorage = new CloudinaryStorage();
