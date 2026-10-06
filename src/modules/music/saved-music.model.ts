import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface SavedMusic {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  providerTrackId: string;
  title: string;
  artistName: string;
  coverImageUrl: string | null;
  audioPreviewUrl: string;
  durationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SavedMusicDocument = HydratedDocument<SavedMusic>;

const savedMusicSchema = new Schema<SavedMusic>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    providerTrackId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    artistName: {
      type: String,
      required: true,
      trim: true,
    },
    coverImageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    audioPreviewUrl: {
      type: String,
      required: true,
      trim: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// A user can only save a specific track once
savedMusicSchema.index({ userId: 1, providerTrackId: 1 }, { unique: true });

export const SavedMusicModel: Model<SavedMusic> =
  (mongoose.models.SavedMusic as Model<SavedMusic> | undefined) ??
  model<SavedMusic>('SavedMusic', savedMusicSchema);
