import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { EngagementTargetType } from '../like.model.js';

export type CommentStatus = 'active' | 'deleted';

export interface Comment {
  _id: Types.ObjectId;
  targetType: EngagementTargetType;
  targetId: Types.ObjectId;
  authorId: Types.ObjectId;
  parentCommentId?: Types.ObjectId;
  text: string;
  likeCount: number;
  replyCount: number;
  status: CommentStatus;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CommentDocument = HydratedDocument<Comment>;
export type CreateCommentRecord = Omit<Comment, '_id' | 'createdAt' | 'updatedAt' | 'likeCount' | 'replyCount'>;

const commentSchema = new Schema<Comment>(
  {
    targetType: { type: String, enum: ['reel', 'post'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    text: { type: String, required: true, trim: true, maxlength: 1_000 },
    likeCount: { type: Number, default: 0, min: 0, required: true },
    replyCount: { type: Number, default: 0, min: 0, required: true },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      required: true,
    },
    deletedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

commentSchema.index(
  { targetType: 1, targetId: 1, status: 1, createdAt: -1, _id: -1 },
  { name: 'ix_comments_target_feed' },
);
commentSchema.index(
  { parentCommentId: 1, status: 1, createdAt: 1 },
  { sparse: true, name: 'ix_comments_replies' },
);
commentSchema.index(
  { authorId: 1, createdAt: -1 },
  { name: 'ix_comments_author' },
);

export const CommentModel: Model<Comment> =
  (mongoose.models.Comment as Model<Comment> | undefined) ??
  model<Comment>('Comment', commentSchema);
