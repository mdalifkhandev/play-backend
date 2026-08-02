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
