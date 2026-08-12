export function getUserRoom(userId: string): string {
  return `user:${userId}`;
}

export function getConversationRoom(conversationId: string): string {
  return `chat:${conversationId}`;
}
