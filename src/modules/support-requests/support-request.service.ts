import { randomBytes } from 'node:crypto';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { ConflictError } from '../../common/errors/conflict-error.js';
import { env } from '../../config/env.config.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { withDatabaseTransaction } from '../../infrastructure/database/transaction-manager.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { mailService } from '../../infrastructure/mail/mail.service.js';
import { auditService } from '../audit/audit.service.js';
import { adminNotificationService } from '../notifications/admin-notification.service.js';
import { UserModel } from '../users/user.model.js';
import {
  SupportMessageSenderType,
  SupportRequestStatus,
} from './support-request.constants.js';
import { toSupportMessageDto, toSupportRequestDto } from './support-request.mapper.js';
import type { SupportRequest } from './support-request.model.js';
import { supportRequestRepository } from './support-request.repository.js';
import type {
  CreateSupportMessageInput,
  CreateSupportRequestInput,
  ListAdminSupportRequestsQuery,
  ListMySupportRequestsQuery,
  UpdateSupportRequestInput,
} from './support-request.validation.js';

const allowedStatusTransitions: Record<SupportRequestStatus, readonly SupportRequestStatus[]> = {
  [SupportRequestStatus.OPEN]: [SupportRequestStatus.IN_PROGRESS, SupportRequestStatus.CLOSED],
  [SupportRequestStatus.IN_PROGRESS]: [
    SupportRequestStatus.OPEN,
    SupportRequestStatus.RESOLVED,
    SupportRequestStatus.CLOSED,
  ],
  [SupportRequestStatus.RESOLVED]: [
    SupportRequestStatus.IN_PROGRESS,
    SupportRequestStatus.CLOSED,
  ],
  [SupportRequestStatus.CLOSED]: [SupportRequestStatus.OPEN],
};

export class SupportRequestService {
  async create(userId: string, input: CreateSupportRequestInput) {
    const request = await withDatabaseTransaction((session) =>
      supportRequestRepository.create(input, userId, createTicketNumber(), session),
    );
    await this.audit(userId, 'support_request.create');
    void this.notifyAdminAboutNewRequest(request, input.message);
    return { request: toSupportRequestDto(request) };
  }

  async listMine(userId: string, query: ListMySupportRequestsQuery) {
    const result = await supportRequestRepository.listForUser(userId, query);
    return pageResult(result.items.map(toSupportRequestDto), result.total, query.page, query.limit);
  }

  async listForAdmin(query: ListAdminSupportRequestsQuery) {
    const result = await supportRequestRepository.listForAdmin(query);
    return pageResult(result.items.map(toSupportRequestDto), result.total, query.page, query.limit);
  }

  async getMine(userId: string, id: string) {
    const request = await supportRequestRepository.findByIdForUser(id, userId);
    return this.detail(request, id);
  }

  async getForAdmin(id: string) {
    const request = await supportRequestRepository.findById(id);
    return this.detail(request, id);
  }

  async replyAsUser(userId: string, id: string, input: CreateSupportMessageInput) {
    await withDatabaseTransaction(async (session) => {
      const request = await supportRequestRepository.findByIdForUser(id, userId, session);

      if (!request) {
        throw this.notFoundError();
      }

      if (request.status === SupportRequestStatus.CLOSED) {
        throw new ConflictError('A closed support request cannot receive new messages.', {
          code: 'SUPPORT_REQUEST_CLOSED',
        });
      }

      await supportRequestRepository.addMessage(
        {
          requestId: id,
          senderUserId: userId,
          senderType: SupportMessageSenderType.USER,
          message: input.message,
          ...(request.status === SupportRequestStatus.RESOLVED
            ? { nextStatus: SupportRequestStatus.OPEN }
            : {}),
        },
        session,
      );
    });

    await this.audit(userId, 'support_request.user_reply');
    const detail = await this.getMine(userId, id);
    void this.notifyAdminAboutUserReply(detail.request, input.message);
    return detail;
  }

  async replyAsStaff(staffUserId: string, id: string, input: CreateSupportMessageInput) {
    await withDatabaseTransaction(async (session) => {
      const request = await supportRequestRepository.findById(id, session);

      if (!request) {
        throw this.notFoundError();
      }

      if (request.status === SupportRequestStatus.CLOSED) {
        throw new ConflictError('A closed support request cannot receive new messages.', {
          code: 'SUPPORT_REQUEST_CLOSED',
        });
      }

      await supportRequestRepository.addMessage(
        {
          requestId: id,
          senderUserId: staffUserId,
          senderType: SupportMessageSenderType.STAFF,
          message: input.message,
          ...(request.status === SupportRequestStatus.OPEN ||
          request.status === SupportRequestStatus.RESOLVED
            ? { nextStatus: SupportRequestStatus.IN_PROGRESS }
            : {}),
        },
        session,
      );
    });

    await this.audit(staffUserId, 'support_request.staff_reply');
    const detail = await this.getForAdmin(id);
    void this.notifyUserAboutStaffReply(detail.request, input.message);
    return detail;
  }

  async updateAsAdmin(staffUserId: string, id: string, input: UpdateSupportRequestInput) {
    const existing = await supportRequestRepository.findById(id);

    if (!existing) {
      throw this.notFoundError();
    }

    if (input.status && input.status !== existing.status) {
      const allowed = allowedStatusTransitions[existing.status];
      if (!allowed.includes(input.status)) {
        throw new BadRequestError(
          `Support request cannot move from ${existing.status} to ${input.status}.`,
          { code: 'INVALID_SUPPORT_STATUS_TRANSITION' },
        );
      }
    }

    if (input.assignedTo) {
      const staffExists = await UserModel.exists({
        _id: input.assignedTo,
        role: { $in: [UserRole.ADMIN, UserRole.MODERATOR] },
      });

      if (!staffExists) {
        throw new BadRequestError('Assigned user must be an admin or moderator.', {
          code: 'INVALID_SUPPORT_ASSIGNEE',
          fieldErrors: [
            {
              field: 'assignedTo',
              message: 'Assigned user must be an admin or moderator.',
              code: 'INVALID_SUPPORT_ASSIGNEE',
            },
          ],
        });
      }
    }

    const updated = await supportRequestRepository.updateByAdmin(id, input);
    if (!updated) throw this.notFoundError();
    await this.audit(staffUserId, 'support_request.update');
    return { request: toSupportRequestDto(updated) };
  }

  async closeMine(userId: string, id: string) {
    const existing = await supportRequestRepository.findByIdForUser(id, userId);

    if (!existing) {
      throw this.notFoundError();
    }

    if (existing.status === SupportRequestStatus.CLOSED) {
      return { request: toSupportRequestDto(existing) };
    }

    const closed = await supportRequestRepository.closeForUser(id, userId);
    if (!closed) throw this.notFoundError();
    await this.audit(userId, 'support_request.close');
    return { request: toSupportRequestDto(closed) };
  }

  private async detail(request: Awaited<ReturnType<typeof supportRequestRepository.findById>>, id: string) {
    if (!request) {
      throw this.notFoundError();
    }

    const messages = await supportRequestRepository.findMessages(id);
    return {
      request: toSupportRequestDto(request),
      messages: messages.map(toSupportMessageDto),
    };
  }

  private notFoundError(): NotFoundError {
    return new NotFoundError('Support request was not found.', {
      code: 'SUPPORT_REQUEST_NOT_FOUND',
    });
  }

  private async audit(actorUserId: string, action: string): Promise<void> {
    await auditService.record({ actorUserId, action, outcome: 'success' });
  }

  private async notifyAdminAboutNewRequest(
    request: Pick<SupportRequest, '_id' | 'ticketNumber' | 'requesterUserId' | 'category' | 'subject'>,
    message: string,
  ): Promise<void> {
    void adminNotificationService.notifyAdmins({
      event: 'support_request_submitted',
      title: 'New support request',
      body: `${request.ticketNumber}: ${request.subject}`,
      relatedEntityId: request._id.toString(),
    });

    if (!env.SUPPORT_ADMIN_EMAIL) return;

    const requesterEmail = await this.findUserEmail(request.requesterUserId.toString());

    await this.sendSupportEmailSafely({
      to: env.SUPPORT_ADMIN_EMAIL,
      subject: `New support request: ${request.subject}`,
      title: 'New support request received',
      intro: 'A user submitted a new support request in Jesusname7.',
      actionLabel: 'NEW TICKET',
      fields: [
        { label: 'Ticket', value: request.ticketNumber },
        { label: 'Requester', value: requesterEmail ?? request.requesterUserId.toString() },
        { label: 'Category', value: request.category },
        { label: 'Subject', value: request.subject },
        { label: 'Message', value: message },
      ],
    });
  }

  private async notifyAdminAboutUserReply(
    request: ReturnType<typeof toSupportRequestDto>,
    message: string,
  ): Promise<void> {
    void adminNotificationService.notifyAdmins({
      event: 'support_request_user_replied',
      title: 'User replied to support',
      body: `${request.ticketNumber}: ${request.subject}`,
      relatedEntityId: request.id,
    });

    if (!env.SUPPORT_ADMIN_EMAIL) return;

    const requesterEmail = await this.findUserEmail(request.requesterUserId);

    await this.sendSupportEmailSafely({
      to: env.SUPPORT_ADMIN_EMAIL,
      subject: `Support reply: ${request.subject}`,
      title: 'User replied to a support request',
      intro: 'A user added a new message to an existing support request.',
      actionLabel: 'USER REPLY',
      fields: [
        { label: 'Ticket', value: request.ticketNumber },
        { label: 'Requester', value: requesterEmail ?? request.requesterUserId },
        { label: 'Status', value: request.status },
        { label: 'Subject', value: request.subject },
        { label: 'Message', value: message },
      ],
    });
  }

  private async notifyUserAboutStaffReply(
    request: ReturnType<typeof toSupportRequestDto>,
    message: string,
  ): Promise<void> {
    const requesterEmail = await this.findUserEmail(request.requesterUserId);
    if (!requesterEmail) return;

    await this.sendSupportEmailSafely({
      to: requesterEmail,
      subject: `Support update: ${request.subject}`,
      title: 'Your support request has an update',
      intro: 'The Jesusname7 support team replied to your request.',
      actionLabel: 'SUPPORT UPDATE',
      fields: [
        { label: 'Ticket', value: request.ticketNumber },
        { label: 'Status', value: request.status },
        { label: 'Subject', value: request.subject },
        { label: 'Reply', value: message },
      ],
    });
  }

  private async findUserEmail(userId: string): Promise<string | null> {
    const user = await UserModel.findById(userId).select('email').lean<{ email: string }>().exec();
    return user?.email ?? null;
  }

  private async sendSupportEmailSafely(
    input: Parameters<typeof mailService.sendSupportNotification>[0],
  ): Promise<void> {
    try {
      await mailService.sendSupportNotification(input);
    } catch (error) {
      logger.error({ err: error, email: input.to, subject: input.subject }, 'Support notification email failed');
    }
  }
}

function createTicketNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `SUP-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function pageResult<T>(items: T[], total: number, page: number, limit: number) {
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export const supportRequestService = new SupportRequestService();
