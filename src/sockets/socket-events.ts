export const SOCKET_EVENTS = {
  LIVE_JOIN: 'live:join',
  LIVE_LEAVE: 'live:leave',
  LIVE_COMMENT: 'live:comment',
  LIVE_LIKE: 'live:like',
  LIVE_GIFT: 'live:gift',
  LIVE_SHARE: 'live:share',
  LIVE_STATUS: 'live:status',

  // Server broadcast events
  USER_JOINED: 'live:user_joined',
  USER_LEFT: 'live:user_left',
  NEW_COMMENT: 'live:new_comment',
  NEW_REACTION: 'live:new_reaction',
  NEW_GIFT: 'live:new_gift',
  NEW_SHARE: 'live:new_share',
  VIEWER_COUNT_UPDATE: 'live:viewer_count_update',
  STREAM_STATUS_CHANGED: 'live:status_changed',

  // Direct Chat events
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_SEND_MESSAGE: 'chat:send_message',
  CHAT_NEW_MESSAGE: 'chat:new_message',
  CHAT_TYPING: 'chat:typing',
  CHAT_TYPING_START: 'chat:typing_start',
  CHAT_TYPING_STOP: 'chat:typing_stop',
  USER_TYPING: 'chat:user_typing',
  CHAT_READ: 'chat:read',
} as const;
