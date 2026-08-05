# Postman — Reels API v2 Test Guide

## 1. Import

1. Postman খোলো
2. **Import** → `postman/Jesusname7 Reels API v2.postman_collection.json`
3. Collection name: **Jesusname7 Reels API v2**

---

## 2. Server start

```bash
cd c:\Users\ratul\Documents\Jesusname7
npm run dev
```

Cloudflare tunnel ব্যবহার করলে:

1. Tunnel চালাও
2. Collection Variables → `baseUrl` =
   `https://YOUR-TUNNEL.trycloudflare.com/api/v1`

Local test:
`http://localhost:3000/api/v1`

---

## 3. Variables set করো

Collection → **Variables**:

| Variable | কী দিবে |
|----------|---------|
| `baseUrl` | `http://localhost:3000/api/v1` বা tunnel URL |
| `accessToken` | Login করে auto আসে, অথবা হাতে paste |
| বাকি | Step চালালে auto fill |

---

## 4. Test order (ধাপে ধাপে)

### Step 0 — Login
- Request: **00 Auth Login**
- Body-তে নিজের email/password দাও
- Send → `accessToken` auto save হবে

অথবা Auth collection থেকে login করে token copy করে Variables-এ `accessToken` বসাও।

### Step 1 — Music (optional)
- **01 Search Music** → Send
- Console-এ `musicId` দেখবে
- Video-only চাইলে skip করতে পারো

### Step 2 — Upload URL
- **02 Get Upload URL** → Send
- Expect: `201`
- Auto save: `uploadId`, `mediaKey`, Cloudinary keys

### Step 3 — Cloudinary upload
- **03 Upload Video To Cloudinary**
- Body → `file` → **Select Files** → valid `.mp4` বা `.mov`
- Send
- Expect: `200`
- Console-এ `duration` থাকলে ভালো

### Step 4 — Complete
- **04 Complete Upload** → Send
- Expect: `200`, `uploadStatus: verified`, `durationMs > 0`
- Fail হলে (duration error): 2–3 sec পরে আবার Send

### Step 5 — Create Reel
**সহজ path (recommended first):**
- **05a Create Reel (Video Only)** → Send
- Expect: `202`, `reelId` save হবে

**Music path:**
- আগে Step 1 চালাও
- **05b Create Reel (With Music)** → Send

### Step 6 — Status poll
- **06 Get Reel Status** → Send
- `queued` / `processing` দেখলে 3–5 sec পর আবার Send
- `ready` হলে success
- `failed` হলে **07 Retry** try করো

> Reel processing-এর জন্য Redis + `npm run worker:dev` + FFmpeg লাগে।  
> শুধু upload/complete test করতে worker না থাকলেও Step 4 পর্যন্ত চলবে।

### Step 7 — Feed
- **08 Feed** → Send
- Ready reel list আসবে + `viewerState`

### Step 8 — Engagement
- Like / Save / Comment / Share requests চালাও
- Reel অবশ্যই `ready` হতে হবে

---

## 5. Expected success checklist

| Step | Status | Check |
|------|--------|-------|
| Login | 200 | `accessToken` set |
| Upload URL | 201 | `uploadUrl` আছে |
| Cloudinary | 200 | `secure_url` আছে |
| Complete | 200 | `durationMs` > 0 |
| Create Reel | 202 | `reelId` আছে |
| Status | 200 | `status: ready` |
| Feed | 200 | items array |

---

## 6. Common errors

| Error | Fix |
|-------|-----|
| `ECONNREFUSED` | `npm run dev` চালাও |
| `401` | Login / accessToken set করো |
| `Uploaded video duration could not be verified` | Valid mp4; Cloudinary success পর complete; server restart (retry fix আছে) |
| Redis stream error | `.env`-এ `REDIS_URL` comment করে server restart |
| Reel stuck `queued` | Redis + `npm run worker:dev` চালাও |
| Music create 422 | `downloadAllowed: true` track; musicTrim >= video duration |

---

## 7. Minimal happy path (৫ request)

1. `00 Auth Login`
2. `02 Get Upload URL`
3. `03 Upload Video To Cloudinary` (file select)
4. `04 Complete Upload`
5. `05a Create Reel (Video Only)`
6. `06 Get Reel Status` (poll until ready)

---

## File location

```text
postman/Jesusname7 Reels API v2.postman_collection.json
```
