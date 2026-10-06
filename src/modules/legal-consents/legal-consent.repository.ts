import type { Types } from 'mongoose';

import {
  LegalConsentModel,
  type LegalConsent,
  type LegalConsentDocument,
  type LegalDocumentType,
} from './legal-consent.model.js';

interface CreateConsentInput {
  userId: string;
  documentType: LegalDocumentType;
  contentPageId: Types.ObjectId;
  version: number;
  acceptedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class LegalConsentRepository {
  async createIdempotently(input: CreateConsentInput): Promise<LegalConsentDocument> {
    const consent = await LegalConsentModel.findOneAndUpdate(
      {
        userId: input.userId,
        documentType: input.documentType,
        version: input.version,
      },
      { $setOnInsert: input },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).exec();

    if (!consent) {
      throw new Error('Legal consent upsert did not return a document.');
    }

    return consent;
  }

  async findForUser(userId: string): Promise<LegalConsent[]> {
    return LegalConsentModel.find({ userId })
      .sort({ acceptedAt: -1 })
      .lean<LegalConsent[]>()
      .exec();
  }
}

export const legalConsentRepository = new LegalConsentRepository();
