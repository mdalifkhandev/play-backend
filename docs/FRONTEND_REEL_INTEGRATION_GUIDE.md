# Frontend Integration Guide — Reel Upload + Feed + Engagement

Base URL: `https://YOUR_API/api/v1`  
Auth: `Authorization: Bearer <accessToken>`  
Response shape:

```json
{ "success": true, "message": "...", "data": { ... } }
```

Error:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

---

## 1. Full app flow (list / publish)

```text
Login
  ↓
Feed list  ←──── GET /reels/feed
  ↓
Create Reel screen
  ↓
① GET upload URL
② Upload video → Cloudinary (direct)
③ POST /media/complete  (+ duration if available)
④ Optional: search music
⑤ POST /reels
⑥ Poll GET /reels/:id until ready
  ↓
Back to Feed (ready reels only)
  ↓
Like / Comment / Save / Share
```

---

## 2. Feed list (home)

### API

```http
GET /api/v1/reels/feed?limit=20&cursor=<optional>
Authorization: Bearer <token>   // optional, but needed for isLiked/isSaved
```

### Response (`data`)

```json
{
  "items": [
    {
      "id": "reel_id",
      "videoUrl": "https://cdn.../final.mp4",
      "thumbnailUrl": "https://cdn.../thumb.jpg",
      "durationMs": 8000,
      "caption": "My reel",
      "user": {
        "id": "user_id",
        "username": "john",
        "avatarUrl": "https://..."
      },
      "stats": {
        "likes": 12,
        "comments": 4,
        "shares": 2,
        "views": 100
      },
      "viewerState": {
        "isLiked": true,
        "isSaved": false
      },
      "createdAt": "...",
      "publishedAt": "..."
    }
  ],
  "nextCursor": "base64...",
  "pagination": {
    "nextCursor": "base64...",
    "hasNextPage": true
  }
}
```

### Frontend rules

| Rule | Detail |
|------|--------|
| Play | `videoUrl` (processed MP4 only) |
| Poster | `thumbnailUrl` |
| Like UI | `viewerState.isLiked` — extra API লাগে না |
| Save UI | `viewerState.isSaved` |
| Counts | `stats.likes / comments / shares` |
| Pagination | `hasNextPage` true হলে `cursor=nextCursor` দিয়ে next page |
| Empty | শুধু `ready` reel আসে; processing reel feed-এ নেই |

### Pseudo code

```typescript
async function loadFeed(cursor?: string) {
  const qs = new URLSearchParams({ limit: '20' });
  if (cursor) qs.set('cursor', cursor);

  const res = await api.get(`/reels/feed?${qs}`);
  return res.data; // { items, nextCursor, pagination }
}
```

Infinite scroll:

```typescript
if (pagination.hasNextPage) {
  loadFeed(pagination.nextCursor);
}
```

---

## 3. Publish Reel flow (step by step)

### Step A — Get upload URL

```http
POST /api/v1/media/upload-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "reel.mp4",
  "contentType": "video/mp4",
  "fileSize": 12345678,
  "mediaType": "video"
}
```

Save from `data`:

- `uploadId`
- `mediaKey` / `publicId`
- `uploadUrl`, `apiKey`, `timestamp`, `signature`

Allowed: `video/mp4`, `video/quicktime` (`.mov`)  
Max size: ~200MB

---

### Step B — Upload to Cloudinary (NOT your backend)

`multipart/form-data` → `uploadUrl`

| Field | Value |
|-------|-------|
| `file` | video file |
| `api_key` | from Step A |
| `timestamp` | from Step A |
| `signature` | from Step A |
| `public_id` | from Step A |
| `overwrite` | `false` |

Save from Cloudinary response:

- `duration` (seconds) ← **important for complete**
- `secure_url` (preview only)

**Do not** send video bytes to your API.

---

### Step C — Complete / verify

```http
POST /api/v1/media/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "uploadId": "<from Step A>",
  "duration": 12.5
}
```

`duration` = Cloudinary upload response-এর `duration` (optional কিন্তু strongly recommended).

Success:

```json
{
  "uploadStatus": "verified",
  "mediaAssetId": "...",
  "mediaKey": "...",
  "durationMs": 12500,
  "publicUrl": "https://..."
}
```

Fail (`UPLOAD_VERIFICATION_FAILED`): ২–৩ sec পরে retry, `duration` সহ পাঠাও।

---

### Step D — Music (optional)

```http
GET /api/v1/music/tracks?search=happy&page=1&limit=20&order=popularity_total
```

Use only tracks with `downloadAllowed === true`.

Save:

- `musicId` = `providerTrackId`
- Preview play: `audioPreviewUrl`

Publish-এ পাঠাবে:

```json
"audio": {
  "originalVolume": 40,
  "musicVolume": 90,
  "musicId": "123456",
  "musicTrim": { "startMs": 0, "endMs": 8000 }
}
```

Rules:

- `musicUrl` ❌ পাঠাবে না
- `musicTrim` length ≥ video trim length
- No music:

```json
"audio": { "originalVolume": 100, "musicVolume": 0 }
```

---

### Step E — Create Reel

```http
POST /api/v1/reels
Authorization: Bearer <token>
Idempotency-Key: <unique-per-publish>
Content-Type: application/json
```

Video-only example:

```json
{
  "rawMediaKey": "<mediaKey from complete>",
  "caption": "My reel",
  "audio": {
    "originalVolume": 100,
    "musicVolume": 0
  },
  "videoEdit": {
    "trim": { "startMs": 0, "endMs": 8000 },
    "filter": "none",
    "effect": "none",
    "exposure": 50,
    "contrast": 50
  }
}
```

Filters: `none`, `vivid`, `warm`, `cool`, `grayscale`, `sepia`  
Effect: শুধু `none` (`sparkle` ❌)

Response `202`:

```json
{ "reelId": "...", "status": "queued", "progress": 0 }
```

---

### Step F — Poll status

```http
GET /api/v1/reels/:reelId
Authorization: Bearer <token>
```

| status | UI |
|--------|----|
| `queued` / `processing` | Progress bar (`progress` 0–100) |
| `ready` | Success → go feed / profile |
| `failed` | Show error; if `error.canRetry` → retry |

Retry:

```http
POST /api/v1/reels/:reelId/retry
```

Poll every 2–5 seconds until `ready` or `failed`.

---

## 4. Engagement (after reel is ready)

| Action | Method | URL |
|--------|--------|-----|
| Like | `PUT` | `/engagements/reels/:reelId/like` |
| Unlike | `DELETE` | `/engagements/reels/:reelId/like` |
| Save | `PUT` | `/engagements/reels/:reelId/save` |
| Unsave | `DELETE` | `/engagements/reels/:reelId/save` |
| Share | `POST` | `/engagements/reels/:reelId/share` |
| Comment | `POST` | `/engagements/reels/:reelId/comments` |
| Comments list | `GET` | `/engagements/reels/:reelId/comments?limit=20` |
| Edit comment | `PATCH` | `/comments/:commentId` |
| Delete comment | `DELETE` | `/comments/:commentId` |
| My saved | `GET` | `/me/saved?type=reel&limit=20` |

### Like

```http
PUT /engagements/reels/:reelId/like
→ { "likeCount": 13, "isLiked": true }
```

Optimistic UI: feed-এ `viewerState.isLiked` + `stats.likes` update করো।

### Comment create

```json
{ "text": "সুন্দর ভিডিও" }
```

Reply:

```json
{ "text": "Thanks", "parentCommentId": "comment_id" }
```

### Share

```json
{ "channel": "copy_link" }
```

Channels: `copy_link`, `whatsapp`, `facebook`, `messenger`, `other`

---

## 5. Screen map (recommended)

| Screen | APIs |
|--------|------|
| Feed / Home | `GET /reels/feed` |
| Reel player | local play + Like/Save/Share/Comment |
| Music picker | `GET /music/tracks` |
| Editor | local trim/filter/volume (no FFmpeg on device) |
| Publish | upload-url → Cloudinary → complete → `/reels` |
| Processing | poll `GET /reels/:id` |
| Saved | `GET /me/saved` |

---

## 6. Frontend state example

```typescript
type PublishState = {
  uploadId?: string;
  mediaKey?: string;
  cloudinaryDuration?: number;
  reelId?: string;
  status?: 'idle' | 'uploading' | 'verifying' | 'queued' | 'processing' | 'ready' | 'failed';
  progress?: number;
  selectedMusic?: {
    musicId: string;
    musicTrim: { startMs: number; endMs: number };
    musicVolume: number;
    originalVolume: number;
  } | null;
};
```

Publish helper (simplified):

```typescript
async function publishReel({ token, file, caption, videoEdit, audio }) {
  // 1) upload-url
  const prep = await api.post('/media/upload-url', {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
    mediaType: 'video',
  });

  // 2) Cloudinary
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', prep.data.apiKey);
  form.append('timestamp', String(prep.data.timestamp));
  form.append('signature', prep.data.signature);
  form.append('public_id', prep.data.publicId);
  form.append('overwrite', 'false');

  const cloud = await fetch(prep.data.uploadUrl, { method: 'POST', body: form }).then(r => r.json());

  // 3) complete
  const verified = await api.post('/media/complete', {
    uploadId: prep.data.uploadId,
    ...(cloud.duration ? { duration: cloud.duration } : {}),
  });

  // 4) create reel
  const reel = await api.post(
    '/reels',
    {
      rawMediaKey: verified.data.mediaKey,
      caption,
      audio,
      videoEdit,
    },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );

  // 5) poll until ready
  return pollReel(reel.data.reelId);
}
```

---

## 7. Do / Don't

| ✅ Do | ❌ Don't |
|-------|----------|
| Upload video to Cloudinary | Send video multipart to backend |
| Call `/media/complete` after Cloudinary | Skip complete |
| Send `duration` from Cloudinary | Ignore duration |
| Use `musicId` only | Send `musicUrl` |
| Poll status | Assume instant ready |
| Use feed `viewerState` | Call like-check per reel |
| Separate like/comment APIs | Stuff engagement inside create reel |

---

## 8. Common errors (UI messages)

| Code | Meaning | UI action |
|------|---------|-----------|
| `ACCESS_TOKEN_REQUIRED` | Not logged in | Go login |
| `UPLOAD_SESSION_EXPIRED` | Took too long | Restart from upload-url |
| `UPLOAD_VERIFICATION_FAILED` | Duration/file issue | Retry complete + send `duration` |
| `REEL_DURATION_TOO_LONG` | Trim > 60s | Shorten trim |
| `MUSIC_PROCESSING_NOT_ALLOWED` | Bad track | Pick another track |
| `MUSIC_INVALID_CLIP_DURATION` | Music trim too short | Extend music trim |
| `RATE_LIMITED` | Too many calls | Wait / retry |

---

## 9. Minimal checklist for frontend team

1. [ ] Login → store `accessToken`
2. [ ] Feed screen → `/reels/feed` + cursor pagination
3. [ ] Show `videoUrl`, counts, `isLiked`, `isSaved`
4. [ ] Publish: upload-url → Cloudinary → complete(+duration) → `/reels`
5. [ ] Processing screen with poll
6. [ ] Music picker with `downloadAllowed` filter
7. [ ] Like / Unlike / Save / Comment / Share APIs
8. [ ] Never send `musicUrl` or `effect: sparkle`

---

## 10. Postman reference

Collection: `postman/Jesusname7 Reels API v2.postman_collection.json`  
Guide: `postman/REELS_API_V2_TEST_GUIDE.md`

Same order as this doc — use it to verify before wiring screens.
