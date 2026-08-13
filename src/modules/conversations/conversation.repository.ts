import mongoose from 'mongoose';

import { ConversationModel, type IConversation } from './conversation.model.js';
import { MessageModel, type IMessage } from './message.model.js';
import { UserBlockModel, type IUserBlock } from './conversation-member.model.js';

const USER_CHAT_PROJECTION = 'profile.username profile.displayName profile.photoUrl username displayName avatarUrl isOnline';

export class ConversationRepository {
  async findOrCreateDirectConversation(userAId: string, userBId: string): Promise<IConversation> {
    const userA = new mongoose.Types.ObjectId(userAId);
    const userB = new mongoose.Types.ObjectId(userBId);

    let conversation = await ConversationModel.findOne({
      type: 'direct',
      participants: { $all: [userA, userB], $size: 2 },
    }).populate('participants', USER_CHAT_PROJECTION);

    if (!conversation) {
      conversation = await ConversationModel.create({
        type: 'direct',
        participants: [userA, userB],
        unreadCount: new Map([
          [userAId, 0],
          [userBId, 0],
        ]),
      });
      conversation = await conversation.populate(
        'participants',
        USER_CHAT_PROJECTION,
      );
    }

    // Remove user from deletedBy if they re-open / start chat
    if (conversation.deletedBy.some((id) => id.toString() === userAId)) {
      await ConversationModel.updateOne(
        { _id: conversation._id },
        { $pull: { deletedBy: userA } },
      );
    }

    return conversation;
  }

  async findById(id: string): Promise<IConversation | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return ConversationModel.findById(id).populate(
      'participants',
      USER_CHAT_PROJECTION,
    );
  }

  async getUserInbox(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: IConversation[]; total: number }> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return { items: [], total: 0 };
    const userObjId = new mongoose.Types.ObjectId(userId);
    const skip = (page - 1) * limit;

    const filter = {
      participants: userObjId,
      deletedBy: { $ne: userObjId },
    };

    const [items, total] = await Promise.all([
      ConversationModel.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participants', USER_CHAT_PROJECTION)
        .exec(),
      ConversationModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  async addMessage(
    conversationId: string,
    senderId: string,
    text?: string,
    mediaUrl?: string,
    attachmentType?: 'image' | 'video' | 'audio' | 'file',
  ): Promise<IMessage> {
    const convObjId = new mongoose.Types.ObjectId(conversationId);
    const senderObjId = new mongoose.Types.ObjectId(senderId);

    const message = await MessageModel.create({
      conversationId: convObjId,
      senderId: senderObjId,
      ...(text ? { text } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(attachmentType ? { attachmentType } : {}),
    });

    const conversation = await ConversationModel.findById(conversationId);
    if (conversation) {
      // Update unread count for other participants
      const unreadMap = conversation.unreadCount || new Map();
      for (const p of conversation.participants) {
        const pId = p.toString();
        if (pId !== senderId) {
          const currentCount = unreadMap.get(pId) || 0;
          unreadMap.set(pId, currentCount + 1);
        }
      }

      await ConversationModel.updateOne(
        { _id: convObjId },
        {
          $set: {
            lastMessage: {
              messageId: message._id,
              ...(text ? { text } : {}),
              ...(mediaUrl ? { mediaUrl } : {}),
              ...(attachmentType ? { attachmentType } : {}),
              senderId: senderObjId,
              createdAt: message.createdAt,
            },
            unreadCount: unreadMap,
            deletedBy: [], // restore conversation for all users on new message
          },
        },
      );
    }

    return message.populate('senderId', USER_CHAT_PROJECTION);
  }

  async getMessages(
    conversationId: string,
    page: number,
    limit: number,
  ): Promise<{ messages: IMessage[]; total: number }> {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return { messages: [], total: 0 };
    }

    const convObjId = new mongoose.Types.ObjectId(conversationId);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      MessageModel.find({ conversationId: convObjId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderId', USER_CHAT_PROJECTION)
        .exec(),
      MessageModel.countDocuments({ conversationId: convObjId }),
    ]);

    return { messages, total };
  }

  async markAsDelivered(
    conversationId: string,
    userId: string,
  ): Promise<{ messageIds: string[]; deliveredAt: Date }> {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return { messageIds: [], deliveredAt: new Date() };
    }

    const convObjId = new mongoose.Types.ObjectId(conversationId);
    const userObjId = new mongoose.Types.ObjectId(userId);
    const deliveredAt = new Date();
    const messages = await MessageModel.find({
      conversationId: convObjId,
      senderId: { $ne: userObjId },
      deliveredAt: { $exists: false },
    })
      .select('_id')
      .lean()
      .exec();

    if (messages.length > 0) {
      await MessageModel.updateMany(
        { _id: { $in: messages.map((message) => message._id) } },
        { $set: { deliveredAt } },
      ).exec();
    }

    return {
      messageIds: messages.map((message) => message._id.toString()),
      deliveredAt,
    };
  }

  async markAsRead(
    conversationId: string,
    userId: string,
  ): Promise<{ messageIds: string[]; readAt: Date }> {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return { messageIds: [], readAt: new Date() };
    }
    const convObjId = new mongoose.Types.ObjectId(conversationId);
    const userObjId = new mongoose.Types.ObjectId(userId);
    const readAt = new Date();

    const conversation = await ConversationModel.findById(conversationId);
    if (conversation) {
      const unreadMap = conversation.unreadCount || new Map();
      unreadMap.set(userId, 0);

      await ConversationModel.updateOne(
        { _id: convObjId },
        { $set: { unreadCount: unreadMap } },
      );
    }

    const messages = await MessageModel.find({
      conversationId: convObjId,
      senderId: { $ne: userObjId },
      isRead: false,
    })
      .select('_id')
      .lean()
      .exec();

    await MessageModel.updateMany(
      { conversationId: convObjId, senderId: { $ne: userObjId }, isRead: false },
      { $set: { isRead: true, readAt, deliveredAt: readAt } },
    ).exec();

    return {
      messageIds: messages.map((message) => message._id.toString()),
      readAt,
    };
  }

  async softDeleteConversation(conversationId: string, userId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) return;
    const convObjId = new mongoose.Types.ObjectId(conversationId);
    const userObjId = new mongoose.Types.ObjectId(userId);

    await ConversationModel.updateOne(
      { _id: convObjId },
      { $addToSet: { deletedBy: userObjId } },
    );
  }

  async blockUser(blockerId: string, blockedId: string): Promise<IUserBlock> {
    const blockerObjId = new mongoose.Types.ObjectId(blockerId);
    const blockedObjId = new mongoose.Types.ObjectId(blockedId);

    return UserBlockModel.findOneAndUpdate(
      { blockerId: blockerObjId, blockedId: blockedObjId },
      { blockerId: blockerObjId, blockedId: blockedObjId },
      { upsert: true, new: true },
    );
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const blockerObjId = new mongoose.Types.ObjectId(blockerId);
    const blockedObjId = new mongoose.Types.ObjectId(blockedId);

    await UserBlockModel.deleteOne({ blockerId: blockerObjId, blockedId: blockedObjId });
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(blockerId) || !mongoose.Types.ObjectId.isValid(blockedId)) {
      return false;
    }
    const count = await UserBlockModel.countDocuments({
      blockerId: new mongoose.Types.ObjectId(blockerId),
      blockedId: new mongoose.Types.ObjectId(blockedId),
    });
    return count > 0;
  }
}

export const conversationRepository = new ConversationRepository();
