import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export type RewardProgramCycle = 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface RewardProgram {
  _id: Types.ObjectId;
  name: string;
  reward: string;
  eligibilityCriteria: string;
  cycle: RewardProgramCycle;
  isActive: boolean;
  sortOrder: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type RewardProgramDocument = HydratedDocument<RewardProgram>;

const rewardProgramSchema = new Schema<RewardProgram>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    reward: { type: String, required: true, trim: true, maxlength: 120 },
    eligibilityCriteria: { type: String, required: true, trim: true, maxlength: 300 },
    cycle: { type: String, enum: ['weekly', 'monthly', 'yearly', 'custom'], default: 'monthly', required: true },
    isActive: { type: Boolean, default: true, required: true, index: true },
    sortOrder: { type: Number, default: 0, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

rewardProgramSchema.index({ isActive: 1, sortOrder: 1 });

export const RewardProgramModel: Model<RewardProgram> =
  (mongoose.models.RewardProgram as Model<RewardProgram> | undefined)
  ?? model<RewardProgram>('RewardProgram', rewardProgramSchema);
