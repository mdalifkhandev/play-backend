import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';

import { assertCloudinaryConfigured, storageConfig } from '../../config/storage.config.js';
import {
  externalTimeoutMs,
  toExternalProviderError,
  withExternalTimeout,
} from '../http/external-timeout.js';
import { cloudinaryClient } from './cloudinary.client.js';
import type {
  StorageDeleteOptions,
  StorageDeleteResult,
  StorageProvider,
  StorageResourceType,
  StorageSignedUpload,
  StorageUploadOptions,
  StoredAsset,
} from './storage.interface.js';

export class CloudinaryStorage implements StorageProvider {
  createSignedUpload(
    publicId: string,
    resourceType: 'image' | 'video' | 'raw',
    timestamp = Math.floor(Date.now() / 1_000),
  ): StorageSignedUpload {
    assertCloudinaryConfigured();

    if (!publicId.trim()) {
      throw new TypeError('Cloudinary public ID must not be empty.');
    }

    const signature = cloudinaryClient.utils.api_sign_request(
      { public_id: publicId, timestamp },
      storageConfig.cloudinary.apiSecret,
    );

    return {
      provider: 'cloudinary',
      cloudName: storageConfig.cloudinary.cloudName,
      apiKey: storageConfig.cloudinary.apiKey,
      timestamp,
      signature,
      publicId,
      resourceType,
      overwrite: false,
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(storageConfig.cloudinary.cloudName)}/${resourceType}/upload`,
    };
  }

  async getAsset(
    publicId: string,
    resourceType: 'image' | 'video',
  ): Promise<StoredAsset> {
    assertCloudinaryConfigured();

    if (!publicId.trim()) {
      throw new TypeError('Cloudinary public ID must not be empty.');
    }

    let result: CloudinaryAssetPayload;
    try {
      result = (await withExternalTimeout(
        cloudinaryClient.api.resource(publicId, {
          resource_type: resourceType,
          type: 'upload',
          ...(resourceType === 'video' ? { media_metadata: true } : {}),
        }),
        {
          provider: 'cloudinary',
          operation: 'getAsset',
          timeoutMs: externalTimeoutMs.cloudinaryAdmin,
          code: 'CLOUDINARY_TIMEOUT',
        },
      )) as unknown as CloudinaryAssetPayload;
    } catch (error) {
      throw toExternalProviderError(error, 'cloudinary', 'getAsset', 'CLOUDINARY_REQUEST_FAILED');
    }

    return this.toStoredAsset(result);
  }

  /**
   * Uses Cloudinary fl_getinfo delivery to read video duration when Admin API
   * has not yet populated duration (common right after large uploads).
   */
  async getVideoDurationViaGetInfo(publicId: string): Promise<number | undefined> {
    assertCloudinaryConfigured();

    const infoUrl = cloudinaryClient.url(publicId, {
      secure: true,
      resource_type: 'video',
      flags: 'getinfo',
    });

    const response = await fetch(infoUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as {
      duration?: unknown;
      video?: { duration?: unknown };
      input?: { duration?: unknown };
    };

    const candidates = [payload.duration, payload.video?.duration, payload.input?.duration];

    for (const candidate of candidates) {
      const duration = Number(candidate);
      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }
    }

    return undefined;
  }

  createThumbnailUrl(publicId: string, resourceType: 'image' | 'video'): string {
    assertCloudinaryConfigured();

    return cloudinaryClient.url(publicId, {
      secure: true,
      resource_type: resourceType,
      ...(resourceType === 'video' ? { format: 'jpg', start_offset: '0' } : {}),
      transformation: [{ width: 480, height: 854, crop: 'limit', quality: 'auto' }],
    });
  }

  async upload(
    source: string,
    options: StorageUploadOptions = {},
  ): Promise<StoredAsset> {
    assertCloudinaryConfigured();

    if (!source.trim()) {
      throw new TypeError('Upload source must not be empty.');
    }

    let result: UploadApiResponse;
    try {
      result = await withExternalTimeout(
        cloudinaryClient.uploader.upload(source, this.buildUploadOptions(options)),
        {
          provider: 'cloudinary',
          operation: 'upload',
          timeoutMs: externalTimeoutMs.cloudinaryUpload,
          code: 'CLOUDINARY_UPLOAD_TIMEOUT',
        },
      );
    } catch (error) {
      throw toExternalProviderError(error, 'cloudinary', 'upload', 'CLOUDINARY_UPLOAD_FAILED');
    }

    return this.toStoredAsset(result as unknown as CloudinaryAssetPayload);
  }

  async uploadBuffer(
    buffer: Buffer,
    options: StorageUploadOptions = {},
  ): Promise<StoredAsset> {
    assertCloudinaryConfigured();

    if (buffer.length === 0) {
      throw new TypeError('Upload buffer must not be empty.');
    }

    let result: UploadApiResponse;
    try {
      result = await withExternalTimeout(
        new Promise<UploadApiResponse>((resolve, reject) => {
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
        }),
        {
          provider: 'cloudinary',
          operation: 'uploadBuffer',
          timeoutMs: externalTimeoutMs.cloudinaryUpload,
          code: 'CLOUDINARY_UPLOAD_TIMEOUT',
        },
      );
    } catch (error) {
      throw toExternalProviderError(error, 'cloudinary', 'uploadBuffer', 'CLOUDINARY_UPLOAD_FAILED');
    }

    return this.toStoredAsset(result as unknown as CloudinaryAssetPayload);
  }

  async deleteAsset(
    publicId: string,
    options: StorageDeleteOptions = {},
  ): Promise<StorageDeleteResult> {
    assertCloudinaryConfigured();

    if (!publicId.trim()) {
      throw new TypeError('Cloudinary public ID must not be empty.');
    }

    let result: { result: string };
    try {
      result = await withExternalTimeout(
        cloudinaryClient.uploader.destroy(publicId, {
          resource_type: options.resourceType ?? 'image',
          invalidate: options.invalidate ?? true,
          type: 'upload',
        }),
        {
          provider: 'cloudinary',
          operation: 'deleteAsset',
          timeoutMs: externalTimeoutMs.cloudinaryDelete,
          code: 'CLOUDINARY_DELETE_TIMEOUT',
        },
      );
    } catch (error) {
      throw toExternalProviderError(error, 'cloudinary', 'deleteAsset', 'CLOUDINARY_DELETE_FAILED');
    }

    if (result.result === 'ok') {
      return { status: 'deleted' };
    }

    if (result.result === 'not found') {
      return { status: 'not-found' };
    }

    throw new Error(`Cloudinary could not delete asset: ${result.result}`);
  }

  private buildUploadOptions(options: StorageUploadOptions): UploadApiOptions {
    const hasExplicitPublicId = options.publicId !== undefined;

    return {
      ...(options.folder !== undefined
        ? options.folder
          ? { folder: options.folder }
          : {}
        : hasExplicitPublicId
          ? {}
          : { folder: storageConfig.cloudinary.uploadFolder }),
      resource_type: options.resourceType ?? 'auto',
      overwrite: options.overwrite ?? false,
      unique_filename: options.publicId === undefined,
      use_filename: false,
      ...(options.publicId ? { public_id: options.publicId } : {}),
      ...(options.tags?.length ? { tags: [...options.tags] } : {}),
    };
  }

  private toStoredAsset(result: CloudinaryAssetPayload): StoredAsset {
    const duration = parseCloudinaryDuration(result);

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
      ...(duration !== undefined ? { duration } : {}),
    };
  }

  private toStorageResourceType(resourceType: string): StorageResourceType {
    if (resourceType === 'image' || resourceType === 'video' || resourceType === 'raw') {
      return resourceType;
    }

    throw new Error(`Unsupported Cloudinary resource type: ${resourceType}`);
  }
}

interface CloudinaryAssetPayload {
  asset_id: string;
  public_id: string;
  secure_url: string;
  resource_type: string;
  bytes: number;
  version: number;
  created_at: string;
  format?: string;
  width?: number;
  height?: number;
  duration?: number | string;
  video?: {
    duration?: number | string;
  };
  audio?: {
    duration?: number | string;
  };
}

function parseCloudinaryDuration(result: CloudinaryAssetPayload): number | undefined {
  const candidates = [
    result.duration,
    result.video?.duration,
    result.audio?.duration,
  ];

  for (const candidate of candidates) {
    const duration = Number(candidate);
    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
  }

  return undefined;
}

export const cloudinaryStorage = new CloudinaryStorage();
