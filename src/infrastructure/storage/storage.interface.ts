export type StorageResourceType = 'image' | 'video' | 'raw';
export type StorageUploadResourceType = StorageResourceType | 'auto';

export interface StorageUploadOptions {
  folder?: string;
  publicId?: string;
  resourceType?: StorageUploadResourceType;
  tags?: readonly string[];
  overwrite?: boolean;
}

export interface StoredAsset {
  assetId: string;
  publicId: string;
  secureUrl: string;
  resourceType: StorageResourceType;
  bytes: number;
  version: number;
  createdAt: string;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface StorageSignedUpload {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  overwrite: false;
  uploadUrl: string;
}

export interface StorageDeleteOptions {
  resourceType?: StorageResourceType;
  invalidate?: boolean;
}

export interface StorageDeleteResult {
  status: 'deleted' | 'not-found';
}

export interface StorageProvider {
  upload(source: string, options?: StorageUploadOptions): Promise<StoredAsset>;
  uploadBuffer(buffer: Buffer, options?: StorageUploadOptions): Promise<StoredAsset>;
  deleteAsset(
    publicId: string,
    options?: StorageDeleteOptions,
  ): Promise<StorageDeleteResult>;
}
