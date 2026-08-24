import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export type RewardWinnerStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface RewardWinner {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  programId?: Types.ObjectId;
  rank: number;
  score: number;
  reward: string;
  cycleLabel: string;
  status: RewardWinnerStatus;
  finalizedBy: Types.ObjectId;
  finalizedAt: Date;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RewardWinnerDocument = HydratedDocument<RewardWinner>;

const rewardWinnerSchema = new Schema<RewardWinner>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: 'RewardProgram' },
    rank: { type: Number, required: true, min: 1 },
    score: { type: Number, required: true, min: 0 },
    reward: { type: String, required: true, trim: true, maxlength: 120 },
    cycleLabel: { type: String, required: true, trim: true, maxlength: 60 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending', required: true, index: true },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    finalizedAt: { type: Date, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

rewardWinnerSchema.index({ cycleLabel: 1, rank: 1 });

export const RewardWinnerModel: Model<RewardWinner> =
  (mongoose.models.RewardWinner as Model<RewardWinner> | undefined)
  ?? model<RewardWinner>('RewardWinner', rewardWinnerSchema);
