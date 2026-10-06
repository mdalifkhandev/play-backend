# Jesusname7 Backend

Production-oriented Node.js, Express, TypeScript and MongoDB API.

## Jamendo music search

Create a Jamendo application and add only its public client ID to `.env`:

```env
JAMENDO_CLIENT_ID=your_new_client_id
```

`JAMENDO_CLIENT_SECRET` and `JAMENDO_REDIRECT_URL` are not used. This integration uses
Jamendo public read APIs through the backend and does not implement OAuth.

Start the API and search tracks:

```bash
npm run dev
curl "http://localhost:5000/api/v1/music/tracks?search=happy&page=1&limit=20"
```

Supported query parameters are `search`, `page`, `limit` (maximum 50), and `order`.
Results are normalized for preview playback and cached in Redis for five minutes when
Redis is configured.

Jamendo music remains subject to each track's license. Before commercial release,
verify attribution, derivative-work, synchronization, and commercial-use permissions.

## Stories media backend

Stories use a direct-to-Cloudinary upload flow. The backend signs the upload, verifies the
uploaded Cloudinary asset, snapshots safe media metadata, then publishes a 24-hour Story.

Required production environment:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=jesusname7
JAMENDO_CLIENT_ID=
STORY_DURATION_HOURS=24
STORY_IMAGE_MAX_BYTES=10485760
STORY_VIDEO_MAX_BYTES=104857600
STORY_VIDEO_MAX_DURATION_SECONDS=60
STORY_UPLOAD_SESSION_TTL_MINUTES=30
```

Run indexes before traffic:

```bash
npm run migrate:story-media
```

Story upload and publish flow:

```bash
# 1. Prepare signed upload
curl -X POST "http://localhost:5000/api/v1/uploads/prepare" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"mediaType":"image","mimeType":"image/jpeg","fileSizeBytes":524288}'

# 2. Upload the file directly to returned uploadUrl with Cloudinary fields:
# file, api_key, timestamp, signature, public_id, overwrite=false

# 3. Verify upload in backend
curl -X POST "http://localhost:5000/api/v1/uploads/complete" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"uploadId":"<uploadId>"}'

# 4. Publish Story
curl -X POST "http://localhost:5000/api/v1/stories" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Idempotency-Key: story-<uuid>" \
  -H "Content-Type: application/json" \
  -d '{"mediaAssetId":"<mediaAssetId>","mediaType":"image","displayDurationSeconds":5}'
```

Public Story APIs:

```bash
GET    /api/v1/stories?limit=20&cursor=<nextCursor>
GET    /api/v1/stories/:storyId
POST   /api/v1/stories/:storyId/views
DELETE /api/v1/stories/:storyId
```

Cleanup expired or deleted Story media:

```bash
npm run cleanup:story-media -- --dry-run
npm run cleanup:story-media -- --batch-size=100
```

MVP limits: direct upload signatures are short lived, only one Story can attach to one
MediaAsset, public feed uses cursor pagination, view counting is one count per viewer,
and video trim/audio settings are stored as playback metadata for the client/player.

## Reels media backend

Reels follow the professional direct-upload + async FFmpeg architecture:

1. App asks backend for upload URL
2. App uploads raw video directly to Cloudinary/CDN
3. App confirms upload, then creates Reel with edit metadata
4. BullMQ worker runs FFmpeg (trim, volume mix, filters, overlay, thumbnail)
5. Feed returns only processed CDN video

### Frontend-friendly endpoints

```bash
POST /api/v1/media/upload-url
POST /api/v1/media/complete
POST /api/v1/reels                 # accepts rawMediaKey or mediaAssetId
GET  /api/v1/reels/:reelId
GET  /api/v1/reels/feed
```

Equivalent secure aliases also exist under `/api/v1/uploads/*`.

`musicUrl` is not accepted — send `musicId` only. Backend verifies Jamendo download permission.
Filter names are case-insensitive (`Vivid` → `vivid`). `overlayText` may be a string or object.
Effect `Sparkle` is not available yet — use `none`.

### Requirements

- Redis (`REDIS_URL`) is required for Reel job queues
- System `ffmpeg` and `ffprobe` on the worker host (Docker images install ffmpeg)
- Cloudinary + Jamendo configured as for Stories

```env
REDIS_URL=redis://127.0.0.1:6379
REEL_MIN_DURATION_MS=1000
REEL_MAX_DURATION_MS=60000
REEL_RAW_VIDEO_MAX_BYTES=209715200
REEL_RAW_VIDEO_MAX_DURATION_MS=180000
REEL_UPLOAD_SESSION_TTL_MINUTES=60
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
MEDIA_TEMP_DIRECTORY=./tmp/media
```

Install indexes, then run API + worker:

```bash
npm run migrate:reels
npm run dev
npm run worker:dev
```

Production:

```bash
npm run build
npm run start
npm run worker:start
```

### Mobile sequence

1. `POST /api/v1/uploads/prepare` with `purpose:"reel"`, `mediaType:"video"`
2. Upload directly to Cloudinary using returned signed fields
3. `POST /api/v1/uploads/complete`
4. `POST /api/v1/reels` with `mediaAssetId` + edit metadata and `Idempotency-Key`
5. Receive `202` + `reelId` (`status: queued`)
6. Poll `GET /api/v1/reels/:reelId` until `status: ready`
7. Feed uses processed CDN URLs only: `GET /api/v1/reels/feed`

Volume contract: client sends integers `0–100`. Worker converts to FFmpeg multipliers
(`70 → 0.7`, `90 → 0.9`). Timing fields use integer milliseconds.

Music must be submitted as `musicId` (Jamendo). Tracks with `downloadAllowed=false`
are rejected with `MUSIC_PROCESSING_NOT_ALLOWED` because FFmpeg cannot legally/technically
mix streaming-only previews into a permanent video. Confirm commercial synchronization
rights before production release.

### Ops commands

```bash
# Re-enqueue queued Reels missing a BullMQ job + fail stale processing
npm run reconcile:reels -- --limit=100

# Cleanup expired raw assets, deleted processed outputs, temp dirs
npm run cleanup:reels -- --dry-run
npm run cleanup:reels -- --batch-size=100
```

### Scaling notes

- Keep API and worker as separate processes in the same repo/deployment unit
- Raise `REEL_WORKER_CONCURRENCY` carefully against CPU/disk
- Prefer horizontal worker replicas with shared Redis and MongoDB
- Never run FFmpeg inside Express request handlers
