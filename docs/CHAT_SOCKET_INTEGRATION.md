# Chat Socket Integration

Socket.IO uses the same host and port as the REST API. Every connection requires a valid access
token and active login session.

```ts
import { io } from 'socket.io-client';

const socket = io(baseUrl, {
  auth: { token: accessToken },
  transports: ['websocket'],
});
```

The token may also be sent as `Authorization: Bearer <accessToken>` during the handshake.

## Client Events

All client events support a Socket.IO acknowledgement callback. Success responses use
`{ success: true, data }`; failures use `{ success: false, error }` and also emit `chat:error`.

```ts
socket.emit('chat:join', { conversationId }, ack);
socket.emit('chat:leave', { conversationId }, ack);
socket.emit('chat:send_message', { conversationId, text, mediaUrl }, ack);
socket.emit('chat:typing_start', { conversationId }, ack);
socket.emit('chat:typing_stop', { conversationId }, ack);
socket.emit('chat:typing', { conversationId, isTyping }, ack);
socket.emit('chat:read', { conversationId }, ack);
```

`text` or `mediaUrl` is required for `chat:send_message`. Text is limited to 2,000 characters.
A user can only join, type in, read, or send to conversations where they are a participant.

## Server Events

```text
chat:joined
chat:new_message
chat:message_delivered
chat:user_typing
chat:read_receipt
chat:error
user:online
user:offline
```

Example message payload:

```json
{
  "id": "messageId",
  "conversationId": "conversationId",
  "sender": {
    "id": "userId",
    "username": "ratul",
    "displayName": "Ratul"
  },
  "text": "Hello",
  "isRead": false,
  "createdAt": "2026-08-12T12:00:00.000Z"
}
```

REST is used to create a direct conversation and load history:

```text
POST /api/v1/conversations              { "targetUserId": "..." }
GET  /api/v1/conversations
GET  /api/v1/conversations/:id/messages?page=1&limit=30
```
