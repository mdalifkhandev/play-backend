import type { SupportMessage } from './support-message.model.js';
import type { SupportRequest } from './support-request.model.js';

export function toSupportRequestDto(request: SupportRequest) {
  return {
    id: request._id.toString(),
    ticketNumber: request.ticketNumber,
    requesterUserId: request.requesterUserId.toString(),
    category: request.category,
    subject: request.subject,
    status: request.status,
    priority: request.priority,
    assignedTo: request.assignedTo?.toString() ?? null,
    messageCount: request.messageCount,
    lastMessageAt: request.lastMessageAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    closedAt: request.closedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function toSupportMessageDto(message: SupportMessage) {
  return {
    id: message._id.toString(),
    senderUserId: message.senderUserId.toString(),
    senderType: message.senderType,
    message: message.message,
    createdAt: message.createdAt.toISOString(),
  };
}
