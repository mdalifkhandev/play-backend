import { Types } from 'mongoose';

import { PlatformSettingModel, type PlatformFeatureFlags, type PlatformSettingDocument } from './platform-setting.model.js';
import type { UpdatePlatformSettingsInput } from './platform-setting.validation.js';
import { cacheKeyPrefixes, cacheKeys } from '../../infrastructure/cache/cache-keys.js';
import { cacheService } from '../../infrastructure/cache/cache.service.js';

const PUBLIC_SETTINGS_CACHE_TTL_SECONDS = 60;

export class PlatformSettingService {
  async getAdminSettings() {
    return this.mapSetting(await this.getOrCreate());
  }

  async getPublicSettings() {
    return cacheService.getOrSet(cacheKeys.publicPlatformSettings, PUBLIC_SETTINGS_CACHE_TTL_SECONDS, async () => {
      const setting = await this.getOrCreate();

      return {
        maintenanceMode: setting.maintenanceMode,
        maintenanceMessage: setting.maintenanceMessage,
        videosBetweenAds: setting.videosBetweenAds,
        languages: setting.languages.filter((language) => language.active),
        featureFlags: setting.featureFlags,
        updatedAt: setting.updatedAt.toISOString(),
      };
    });
  }

  async updateAdminSettings(adminUserId: string, input: UpdatePlatformSettingsInput) {
    const current = await this.getOrCreate();
    const update: Record<string, unknown> = {
      ...input,
      featureFlags: {
        ...current.featureFlags,
        ...(input.featureFlags ?? {}),
      },
      updatedBy: new Types.ObjectId(adminUserId),
    };

    if (!input.featureFlags) {
      delete update.featureFlags;
    }

    const setting = await PlatformSettingModel.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, runValidators: true },
    ).exec();

    await cacheService.deleteByPrefix(cacheKeyPrefixes.platformSettings);

    return this.mapSetting(setting);
  }

  async isFeatureEnabled(feature: keyof PlatformFeatureFlags) {
    const setting = await this.getOrCreate();
    return setting.featureFlags[feature] !== false;
  }

  private async getOrCreate() {
    let setting = await PlatformSettingModel.findOne().exec();
    if (!setting) {
      setting = await PlatformSettingModel.create({});
    }
    return setting;
  }

  private mapSetting(setting: PlatformSettingDocument) {
    return {
      maintenanceMode: setting.maintenanceMode,
      maintenanceMessage: setting.maintenanceMessage,
      videosBetweenAds: setting.videosBetweenAds,
      payoutPerThousandViewsUsd: setting.payoutPerThousandViewsUsd,
      creatorSharePercentage: setting.creatorSharePercentage,
      platformSharePercentage: setting.platformSharePercentage,
      languages: setting.languages,
      featureFlags: setting.featureFlags,
      updatedAt: setting.updatedAt.toISOString(),
    };
  }
}

export const platformSettingService = new PlatformSettingService();
