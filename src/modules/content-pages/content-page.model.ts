import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { ContentPageStatus, ContentPageType } from './content-page.constants.js';

export interface ContentSection {
  heading: string;
  content: string;
  order: number;
}

export interface ContentPage {
  _id: Types.ObjectId;
  pageType: ContentPageType;
  title: string;
  sections: ContentSection[];
  version: number;
  status: ContentPageStatus;
  changeSummary?: string;
  effectiveAt?: Date;
  publishedAt?: Date;
  publishedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentPageDocument = HydratedDocument<ContentPage>;

const contentSectionSchema = new Schema<ContentSection>(
  {
    heading: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, required: true, trim: true, maxlength: 20_000 },
    order: { type: Number, required: true, min: 0, max: 1_000 },
  },
  { _id: false },
);

const contentPageSchema = new Schema<ContentPage>(
  {
    pageType: {
      type: String,
      enum: Object.values(ContentPageType),
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    sections: {
      type: [contentSectionSchema],
      required: true,
      validate: {
        validator: (sections: ContentSection[]) => sections.length > 0 && sections.length <= 50,
        message: 'A content page must contain between 1 and 50 sections.',
      },
    },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(ContentPageStatus),
      default: ContentPageStatus.DRAFT,
      required: true,
      index: true,
    },
    changeSummary: { type: String, trim: true, maxlength: 500 },
    effectiveAt: { type: Date },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

contentPageSchema.index({ pageType: 1, version: 1 }, { unique: true });
contentPageSchema.index({ pageType: 1, status: 1, publishedAt: -1 });
contentPageSchema.index(
  { pageType: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ContentPageStatus.PUBLISHED },
    name: 'one_published_version_per_page',
  },
);

export const ContentPageModel: Model<ContentPage> =
  (mongoose.models.ContentPage as Model<ContentPage> | undefined) ??
  model<ContentPage>('ContentPage', contentPageSchema);
