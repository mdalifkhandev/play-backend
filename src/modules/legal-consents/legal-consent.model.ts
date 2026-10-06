import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { ContentPageType } from '../content-pages/content-page.constants.js';

export const legalDocumentTypes = [
  ContentPageType.PRIVACY_POLICY,
  ContentPageType.TERMS_CONDITIONS,
] as const;

export type LegalDocumentType = (typeof legalDocumentTypes)[number];

export interface LegalConsent {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  documentType: LegalDocumentType;
  contentPageId: Types.ObjectId;
  version: number;
  acceptedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export type LegalConsentDocument = HydratedDocument<LegalConsent>;

const legalConsentSchema = new Schema<LegalConsent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentType: { type: String, enum: legalDocumentTypes, required: true },
    contentPageId: { type: Schema.Types.ObjectId, ref: 'ContentPage', required: true },
    version: { type: Number, required: true, min: 1 },
    acceptedAt: { type: Date, required: true, default: Date.now },
    ipAddress: { type: String, trim: true, maxlength: 100 },
    userAgent: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

legalConsentSchema.index(
  { userId: 1, documentType: 1, version: 1 },
  { unique: true },
);
legalConsentSchema.index({ userId: 1, acceptedAt: -1 });
legalConsentSchema.index({ contentPageId: 1, acceptedAt: -1 });

export const LegalConsentModel: Model<LegalConsent> =
  (mongoose.models.LegalConsent as Model<LegalConsent> | undefined) ??
  model<LegalConsent>('LegalConsent', legalConsentSchema);
