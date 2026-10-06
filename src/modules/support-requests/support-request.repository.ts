import type { ClientSession, UpdateQuery } from 'mongoose';

import { SupportMessageModel, type SupportMessage } from './support-message.model.js';
import {
  SupportMessageSenderType,
  SupportRequestStatus,
} from './support-request.constants.js';
import {
  SupportRequestModel,
  type SupportRequest,
  type SupportRequestDocument,
} from './support-request.model.js';
import type {
  CreateSupportRequestInput,
  ListAdminSupportRequestsQuery,
  ListMySupportRequestsQuery,
  UpdateSupportRequestInput,
} from './support-request.validation.js';

interface AddMessageInput {
  requestId: string;
  senderUserId: string;
  senderType: SupportMessageSenderType;
  message: string;
  nextStatus?: SupportRequestStatus;
}

export class SupportRequestRepository {
  async create(
    input: CreateSupportRequestInput,
    requesterUserId: string,
    ticketNumber: string,
    session: ClientSession,
  ): Promise<SupportRequestDocument> {
    const created = await SupportRequestModel.create(
      [
        {
          ticketNumber,
          requesterUserId,
          category: input.category,
          subject: input.subject,
          messageCount: 1,
          lastMessageAt: new Date(),
        },
      ],
      { session },
    );
    const request = created[0];

    if (!request) {
      throw new Error('Support request creation did not return a document.');
    }

    await SupportMessageModel.create(
      [
        {
          supportRequestId: request._id,
          senderUserId: requesterUserId,
          senderType: SupportMessageSenderType.USER,
          message: input.message,
        },
      ],
      { session },
    );

    return request;
  }

  async findById(id: string, session?: ClientSession): Promise<SupportRequestDocument | null> {
    const query = SupportRequestModel.findById(id);
    if (session) query.session(session);
    return query.exec();
  }

  async findByIdForUser(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<SupportRequestDocument | null> {
    const query = SupportRequestModel.findOne({ _id: id, requesterUserId: userId });
    if (session) query.session(session);
    return query.exec();
  }

  async listForUser(
    userId: string,
    query: ListMySupportRequestsQuery,
  ): Promise<{ items: SupportRequest[]; total: number }> {
    const filter = {
      requesterUserId: userId,
      ...(query.status ? { status: query.status } : {}),
    };
    return this.list(filter, query.page, query.limit);
  }

  async listForAdmin(
    query: ListAdminSupportRequestsQuery,
  ): Promise<{ items: SupportRequest[]; total: number }> {
    const filter = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.requesterUserId ? { requesterUserId: query.requesterUserId } : {}),
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
    };
    return this.list(filter, query.page, query.limit);
  }

  async findMessages(requestId: string, limit = 100): Promise<SupportMessage[]> {
    const newestFirst = await SupportMessageModel.find({ supportRequestId: requestId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<SupportMessage[]>()
      .exec();

    return newestFirst.reverse();
  }

  async addMessage(input: AddMessageInput, session: ClientSession): Promise<void> {
    const createdAt = new Date();

    await SupportMessageModel.create(
      [{
        supportRequestId: input.requestId,
        senderUserId: input.senderUserId,
        senderType: input.senderType,
        message: input.message,
      }],
      { session },
    );

    await SupportRequestModel.updateOne(
      { _id: input.requestId },
      {
        $inc: { messageCount: 1 },
        $set: {
          lastMessageAt: createdAt,
          ...(input.nextStatus ? { status: input.nextStatus } : {}),
        },
        ...(input.nextStatus === SupportRequestStatus.OPEN
          ? { $unset: { resolvedAt: 1, closedAt: 1 } }
          : {}),
      },
      { session },
    ).exec();
  }

  async updateByAdmin(
    id: string,
    input: UpdateSupportRequestInput,
  ): Promise<SupportRequestDocument | null> {
    const now = new Date();
    const update: UpdateQuery<SupportRequest> = {
      $set: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}),
        ...(input.status === SupportRequestStatus.RESOLVED ? { resolvedAt: now } : {}),
        ...(input.status === SupportRequestStatus.CLOSED ? { closedAt: now } : {}),
      },
    };

    if (input.assignedTo === null) {
      update.$unset = { assignedTo: 1 };
    }

    if (input.status === SupportRequestStatus.OPEN || input.status === SupportRequestStatus.IN_PROGRESS) {
      update.$unset = { ...(update.$unset ?? {}), resolvedAt: 1, closedAt: 1 };
    }

    return SupportRequestModel.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
      runValidators: true,
    }).exec();
  }

  async closeForUser(id: string, userId: string): Promise<SupportRequestDocument | null> {
    return SupportRequestModel.findOneAndUpdate(
      {
        _id: id,
        requesterUserId: userId,
        status: { $ne: SupportRequestStatus.CLOSED },
      },
      { $set: { status: SupportRequestStatus.CLOSED, closedAt: new Date() } },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  private async list(
    filter: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<{ items: SupportRequest[]; total: number }> {
    const [items, total] = await Promise.all([
      SupportRequestModel.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<SupportRequest[]>()
        .exec(),
      SupportRequestModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}

export const supportRequestRepository = new SupportRequestRepository();
