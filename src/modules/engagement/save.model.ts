import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { EngagementTargetType } from './like.model.js';

export interface Save {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  targetType: EngagementTargetType;
  targetId: Types.ObjectId;
  createdAt: Date;
}

export type SaveDocument = HydratedDocument<Save>;

const saveSchema = new Schema<Save>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['reel', 'post'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

saveSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true, name: 'uq_saves_user_target' },
);
saveSchema.index(
  { userId: 1, targetType: 1, createdAt: -1 },
  { name: 'ix_saves_user_type_created' },
);
saveSchema.index(
  { targetType: 1, targetId: 1, createdAt: -1 },
  { name: 'ix_saves_target_created' },
);

export const SaveModel: Model<Save> =
  (mongoose.models.Save as Model<Save> | undefined) ?? model<Save>('Save', saveSchema);
