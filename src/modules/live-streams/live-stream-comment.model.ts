import mongoose, { type Document, Schema } from 'mongoose';

export interface ILiveStreamComment extends Document {
  streamId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const liveStreamCommentSchema = new Schema<ILiveStreamComment>(
  {
    streamId: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
);

liveStreamCommentSchema.index({ streamId: 1, createdAt: -1 });

export const LiveStreamCommentModel = mongoose.model<ILiveStreamComment>(
  'LiveStreamComment',
  liveStreamCommentSchema,
);
