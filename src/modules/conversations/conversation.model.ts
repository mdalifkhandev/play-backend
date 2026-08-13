import mongoose, { type Document, Schema } from 'mongoose';

import { CONVERSATION_TYPE, type ConversationType } from './conversation.constants.js';

export interface ILastMessageSnapshot {
  messageId?: mongoose.Types.ObjectId;
  text?: string;
  mediaUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
  senderId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IConversation extends Document {
  type: ConversationType;
  participants: mongoose.Types.ObjectId[];
  lastMessage?: ILastMessageSnapshot;
  unreadCount: Map<string, number>;
  deletedBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const lastMessageSchema = new Schema<ILastMessageSnapshot>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    text: { type: String, trim: true, maxlength: 2000 },
    mediaUrl: { type: String, trim: true },
    attachmentType: {
      type: String,
      enum: ['image', 'video', 'audio', 'file'],
    },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: Object.values(CONVERSATION_TYPE),
      default: CONVERSATION_TYPE.DIRECT,
      required: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: { type: lastMessageSchema },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    deletedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  },
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });

export const ConversationModel = mongoose.model<IConversation>(
  'Conversation',
  conversationSchema,
);
