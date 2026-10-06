import { describe, expect, it, beforeEach } from 'vitest';
import { ConversationService } from '../src/modules/conversations/conversation.service.js';
import { AppError } from '../src/common/errors/app-error.js';

describe('Direct Messaging, Inbox & Chat Subsystem', () => {
  let repository: any;
  let service: ConversationService;

  const userAId = '640000000000000000000001';
  const userBId = '640000000000000000000002';
  const conversationId = '640000000000000000000099';

  beforeEach(() => {
    const mockConversations = new Map<string, any>();
    const mockMessages: any[] = [];
    const mockBlocks = new Set<string>();

    repository = {
      findOrCreateDirectConversation: async (a: string, b: string) => {
        if (!mockConversations.has(conversationId)) {
          mockConversations.set(conversationId, {
            _id: conversationId,
            type: 'direct',
            participants: [
              { _id: a, username: 'jhon_doe', displayName: 'Jhon Doe', photoUrl: 'http://avatar1.jpg', isOnline: true },
              { _id: b, username: 'rokey', displayName: 'Rokey', photoUrl: 'http://avatar2.jpg', isOnline: true },
            ],
            unreadCount: new Map([
              [a, 0],
              [b, 0],
            ]),
            deletedBy: [],
            updatedAt: new Date('2026-08-09T10:30:00Z'),
            createdAt: new Date('2026-08-09T10:00:00Z'),
          });
        }
        return mockConversations.get(conversationId);
      },
      findById: async (id: string) => mockConversations.get(id) ?? null,
      getUserInbox: async (userId: string, page: number, limit: number) => ({
        items: Array.from(mockConversations.values()),
        total: mockConversations.size,
      }),
      addMessage: async (convId: string, senderId: string, text?: string, mediaUrl?: string) => {
        const msg = {
          _id: `msg_${mockMessages.length + 1}`,
          conversationId: convId,
          senderId: { _id: senderId, username: 'jhon_doe', displayName: 'Jhon Doe' },
          text,
          mediaUrl,
          isRead: false,
          createdAt: new Date(),
        };
        mockMessages.push(msg);

        const conv = mockConversations.get(convId);
        if (conv) {
          conv.lastMessage = {
            messageId: msg._id,
            text,
            mediaUrl,
            senderId,
            createdAt: msg.createdAt,
          };
          const currentCount = conv.unreadCount.get(userBId) || 0;
          conv.unreadCount.set(userBId, currentCount + 1);
        }
        return msg;
      },
      getMessages: async (convId: string, page: number, limit: number) => ({
        messages: mockMessages.filter((m) => m.conversationId === convId),
        total: mockMessages.length,
      }),
      markAsRead: async (convId: string, userId: string) => {
        const conv = mockConversations.get(convId);
        if (conv) {
          conv.unreadCount.set(userId, 0);
        }
      },
      softDeleteConversation: async (convId: string, userId: string) => {
        const conv = mockConversations.get(convId);
        if (conv) {
          conv.deletedBy.push(userId);
        }
      },
      blockUser: async (blockerId: string, blockedId: string) => {
        mockBlocks.add(`${blockerId}:${blockedId}`);
        return { blockerId, blockedId };
      },
      unblockUser: async (blockerId: string, blockedId: string) => {
        mockBlocks.delete(`${blockerId}:${blockedId}`);
      },
      isBlocked: async (blockerId: string, blockedId: string) => mockBlocks.has(`${blockerId}:${blockedId}`),
    };

    service = new ConversationService(repository as any);
  });

  it('initializes a 1-on-1 direct conversation with recipient details', async () => {
    const conv = await service.getOrCreateConversation(userAId, userBId);

    expect(conv.id).toBe(conversationId);
    expect(conv.type).toBe('direct');
    expect(conv.participant.username).toBe('rokey');
    expect(conv.participant.isOnline).toBe(true);
  });

  it('prevents starting a conversation with oneself', async () => {
    await expect(service.getOrCreateConversation(userAId, userAId)).rejects.toThrow(AppError);
  });

  it('sends a chat message and updates conversation lastMessage snapshot & unread counter', async () => {
    await service.getOrCreateConversation(userAId, userBId);

    const msg = await service.sendMessage(conversationId, userAId, {
      text: 'Hey! How was the new design project coming along?',
    });

    expect(msg.text).toBe('Hey! How was the new design project coming along?');
    expect(msg.sender.id).toBe(userAId);

    const inbox = await service.getInbox(userBId, { page: 1, limit: 10 });
    expect(inbox.items[0]?.lastMessage?.text).toBe('Hey! How was the new design project coming along?');
    expect(inbox.items[0]?.unreadCount).toBe(1);
    expect(inbox.pagination.total).toBe(1);
  });

  it('fetches chat message history and marks conversation as read', async () => {
    await service.getOrCreateConversation(userAId, userBId);
    await service.sendMessage(conversationId, userAId, { text: 'Hello Rokey!' });

    const result = await service.getMessages(conversationId, userBId, { page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.text).toBe('Hello Rokey!');

    const inbox = await service.getInbox(userBId);
    expect(inbox.items[0]?.unreadCount).toBe(0);
  });

  it('soft deletes a conversation for the user', async () => {
    await service.getOrCreateConversation(userAId, userBId);
    await service.deleteConversation(conversationId, userAId);

    const conv = await repository.findById(conversationId);
    expect(conv.deletedBy).toContain(userAId);
  });

  it('blocks and unblocks a user', async () => {
    const blockRes = await service.blockUser(userAId, userBId);
    expect(blockRes.blocked).toBe(true);

    await expect(service.getOrCreateConversation(userBId, userAId)).rejects.toThrow(AppError);

    const unblockRes = await service.unblockUser(userAId, userBId);
    expect(unblockRes.blocked).toBe(false);
  });

  it('broadcasts typing_start and typing_stop socket events', async () => {
    const { registerChatSocketHandlers } = await import('../src/sockets/handlers/chat.socket.js');

    const handlers: Record<string, Function> = {};
    const emittedEvents: any[] = [];

    const mockSocket: any = {
      user: { userId: userAId },
      rooms: new Set([`chat:${conversationId}`]),
      on: (event: string, fn: Function) => {
        handlers[event] = fn;
      },
      emit: () => undefined,
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ room, event, payload });
        },
      }),
    };

    registerChatSocketHandlers(null, mockSocket);

    expect(handlers['chat:typing_start']).toBeDefined();
    expect(handlers['chat:typing_stop']).toBeDefined();

    await handlers['chat:typing_start']({ conversationId });
    expect(emittedEvents[0]).toEqual({
      room: `chat:${conversationId}`,
      event: 'chat:user_typing',
      payload: { conversationId, userId: userAId, isTyping: true },
    });

    await handlers['chat:typing_stop']({ conversationId });
    expect(emittedEvents[1]).toEqual({
      room: `chat:${conversationId}`,
      event: 'chat:user_typing',
      payload: { conversationId, userId: userAId, isTyping: false },
    });
  });
});
