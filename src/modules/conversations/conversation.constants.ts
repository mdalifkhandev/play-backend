export const CONVERSATION_TYPE = {
  DIRECT: 'direct',
  GROUP: 'group',
} as const;

export type ConversationType = (typeof CONVERSATION_TYPE)[keyof typeof CONVERSATION_TYPE];

export const CHAT_EVENTS = {
  JOIN: 'chat:join',
  LEAVE: 'chat:leave',
  SEND_MESSAGE: 'chat:send_message',
  NEW_MESSAGE: 'chat:new_message',
  TYPING: 'chat:typing',
  READ_RECEIPT: 'chat:read_receipt',
} as const;
