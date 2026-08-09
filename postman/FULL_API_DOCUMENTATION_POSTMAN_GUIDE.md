# Complete Backend API Documentation & Postman Guide

This document contains full details for testing all backend APIs available on **jesusname7-backend**.

---

## 🌐 Environment & Setup
- **Base URL**: `http://localhost:3000/api/v1`
- **Authentication**: Bearer Token in Request Header:
  ```http
  Authorization: Bearer <YOUR_ACCESS_TOKEN>
  ```
- **Postman Collections Available**:
  - `postman/Jesusname7 Auth.postman_collection.json`
  - `postman/Jesusname7 Live Streams API.postman_collection.json`
  - `postman/Jesusname7 Rich Reels & Media API.postman_collection.json`
  - `postman/Jesusname7 Reels API v2.postman_collection.json`
  - `postman/Jesusname7 Stories API.postman_collection.json`
  - `postman/Jesusname7 Music API.postman_collection.json`
  - `postman/Jesusname7 Content Legal Support.postman_collection.json`

---

## 1. Authentication & Security (`/api/v1/auth`)

### 1.1 User Registration
- **Method**: `POST`
- **URL**: `{{baseUrl}}/auth/register`
- **Header**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!",
    "username": "johndoe",
    "displayName": "John Doe"
  }
  ```
- **Demo Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully.",
    "data": {
      "user": {
        "id": "640000000000000000000101",
        "email": "user@example.com",
        "username": "johndoe",
        "displayName": "John Doe",
        "role": "USER"
      },
      "tokens": {
        "accessToken": "eyJhbGciOiJIUzI1Ni...",
        "refreshToken": "eyJhbGciOiJIUzI1Ni..."
      }
    }
  }
  ```

### 1.2 User Login
- **Method**: `POST`
- **URL**: `{{baseUrl}}/auth/login`
- **Header**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!"
  }
  ```
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "data": {
      "user": {
        "id": "640000000000000000000101",
        "email": "user@example.com",
        "role": "USER"
      },
      "accessToken": "eyJhbGciOiJIUzI1Ni..."
    }
  }
  ```

---

## 2. Live Streams Subsystem (`/api/v1/live-streams`)

### 2.1 Create Live Stream Session
- **Method**: `POST`
- **URL**: `{{baseUrl}}/live-streams`
- **Headers**:
  ```http
  Authorization: Bearer {{accessToken}}
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "title": "Gaming Finals & DJ Music Set 🎧🔥",
    "description": "Join the live stream performance!",
    "category": "Gaming",
    "coverImage": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4"
  }
  ```
- **Demo Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Live stream created successfully.",
    "data": {
      "id": "640000000000000000000201",
      "host": {
        "id": "640000000000000000000101",
        "username": "johndoe",
        "displayName": "John Doe",
        "isVerified": true
      },
      "title": "Gaming Finals & DJ Music Set 🎧🔥",
      "description": "Join the live stream performance!",
      "status": "SCHEDULED",
      "channelName": "live_17200000_abc123",
      "viewerCount": 0,
      "peakViewerCount": 0,
      "likesCount": 0,
      "giftsCount": 0,
      "category": "Gaming",
      "createdAt": "2026-08-06T17:00:00.000Z"
    }
  }
  ```

### 2.2 Get WebRTC/RTC Stream Token
- **Method**: `POST`
- **URL**: `{{baseUrl}}/live-streams/:id/token`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Stream token generated.",
    "data": {
      "token": "bGl2ZV8xNzIwMDAwMF9hYmMxMjM6NjQwMDAw...",
      "channelName": "live_17200000_abc123",
      "role": "host",
      "expiresInSeconds": 3600
    }
  }
  ```

### 2.3 Start Live Broadcast
- **Method**: `POST`
- **URL**: `{{baseUrl}}/live-streams/:id/start`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Live stream started.",
    "data": {
      "id": "640000000000000000000201",
      "status": "LIVE",
      "startedAt": "2026-08-06T17:01:00.000Z"
    }
  }
  ```

### 2.4 Discovery Feed Grid (TikTok / Facebook Live style)
- **Method**: `GET`
- **URL**: `{{baseUrl}}/live-streams?tab=live&category=Gaming&page=1&limit=20`
- **Query Params**:
  - `tab`: `live` | `all` | `watch` | `recent` | `top_like`
  - `category`: optional string
  - `page`: default 1
  - `limit`: default 20
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Live stream feed retrieved.",
    "data": {
      "items": [
        {
          "id": "640000000000000000000201",
          "host": {
            "id": "640000000000000000000101",
            "username": "diannewilson",
            "displayName": "Dianne Wilson",
            "isVerified": true
          },
          "title": "Gaming Finals & DJ Music Set",
          "coverImage": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4",
          "status": "LIVE",
          "viewerCount": 41300,
          "likesCount": 12000,
          "startedAt": "2026-08-06T17:01:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1
      }
    }
  }
  ```

### 2.5 Post Live Stream Comment
- **Method**: `POST`
- **URL**: `{{baseUrl}}/live-streams/:id/comments`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Request Body**:
  ```json
  {
    "text": "Awesome clutch! 👌👌"
  }
  ```
- **Demo Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Comment posted to live stream.",
    "data": {
      "id": "640000000000000000000301",
      "streamId": "640000000000000000000201",
      "user": {
        "id": "640000000000000000000101",
        "username": "jenny",
        "displayName": "Jenny Wilson",
        "isVerified": true
      },
      "text": "Awesome clutch! 👌👌",
      "createdAt": "2026-08-06T17:02:00.000Z"
    }
  }
  ```

### 2.6 Send Heart Reaction
- **Method**: `POST`
- **URL**: `{{baseUrl}}/live-streams/:id/like`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Reaction sent.",
    "data": {
      "likesCount": 12001
    }
  }
  ```

### 2.7 End Live Broadcast
- **Method**: `POST`
- **URL**: `{{baseUrl}}/live-streams/:id/end`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Live stream ended.",
    "data": {
      "id": "640000000000000000000201",
      "status": "ENDED",
      "endedAt": "2026-08-06T17:30:00.000Z"
    }
  }
  ```

---

## 3. Reels & Rich Media Editing Subsystem (`/api/v1/reels`)

### 3.1 Create Post / Reel with Full Editing Payload
- **Method**: `POST`
- **URL**: `{{baseUrl}}/reels`
- **Headers**:
  ```http
  Authorization: Bearer {{accessToken}}
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "mediaAssetId": "640000000000000000000199",
    "mediaType": "video",
    "caption": "Awesome day at the park! #nightlife #dance #noir",
    "hashtags": ["nightlife", "dance", "noir"],
    "mentions": ["640000000000000000000102"],
    "location": {
      "name": "Central Park, NY",
      "latitude": 40.785091,
      "longitude": -73.968285
    },
    "forKids": false,
    "audio": {
      "originalVolume": 50,
      "musicVolume": 50,
      "musicId": "jamendo_track_42",
      "musicTrim": {
        "startMs": 0,
        "endMs": 15000
      }
    },
    "videoEdit": {
      "trim": {
        "startMs": 0,
        "endMs": 15000
      },
      "filter": "none",
      "effect": "none",
      "exposure": 50,
      "contrast": 50,
      "overlayText": {
        "text": "Good morning",
        "x": 0.5,
        "y": 0.2,
        "fontSize": 42
      }
    }
  }
  ```
- **Demo Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Reel created.",
    "data": {
      "reelId": "640000000000000000000501",
      "status": "QUEUED",
      "progress": 0,
      "replayed": false
    }
  }
  ```

### 3.2 Get Reels Feed (with Hashtag Filter)
- **Method**: `GET`
- **URL**: `{{baseUrl}}/reels/feed?hashtag=nightlife&limit=20`
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Feed retrieved.",
    "data": {
      "items": [
        {
          "id": "640000000000000000000501",
          "videoUrl": "https://res.cloudinary.com/demo/video/upload/v1/processed.mp4",
          "thumbnailUrl": "https://res.cloudinary.com/demo/image/upload/v1/thumb.jpg",
          "durationMs": 15000,
          "caption": "Awesome day at the park! #nightlife #dance #noir",
          "hashtags": ["nightlife", "dance", "noir"],
          "location": {
            "name": "Central Park, NY",
            "latitude": 40.785091,
            "longitude": -73.968285
          },
          "mediaType": "video",
          "forKids": false,
          "user": {
            "id": "640000000000000000000101",
            "username": "johndoe",
            "avatarUrl": "https://example.com/avatar.jpg"
          },
          "stats": {
            "likes": 25,
            "comments": 4,
            "shares": 2,
            "views": 180
          },
          "viewerState": {
            "isLiked": false,
            "isSaved": false
          },
          "createdAt": "2026-08-06T17:05:00.000Z",
          "publishedAt": "2026-08-06T17:06:00.000Z"
        }
      ],
      "nextCursor": null,
      "pagination": {
        "nextCursor": null,
        "hasNextPage": false
      }
    }
  }
  ```

---

## 4. Ephemeral Stories Subsystem (`/api/v1/stories`)

### 4.1 Create 24-Hour Story
- **Method**: `POST`
- **URL**: `{{baseUrl}}/stories`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Request Body**:
  ```json
  {
    "mediaAssetId": "640000000000000000000199",
    "caption": "My morning coffee! ☕"
  }
  ```

### 4.2 Get Active Stories Feed
- **Method**: `GET`
- **URL**: `{{baseUrl}}/stories/feed`
- **Headers**: `Authorization: Bearer {{accessToken}}`

---

## 5. Music Catalog Subsystem (`/api/v1/music`)

### 5.1 Search Music Tracks
- **Method**: `GET`
- **URL**: `{{baseUrl}}/music/tracks?search=happy&page=1&limit=20`
- **Demo Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Tracks retrieved.",
    "data": {
      "tracks": [
        {
          "provider": "jamendo",
          "providerTrackId": "42",
          "title": "Neon Pulse",
          "artistName": "CYBERHAWK",
          "durationSeconds": 165,
          "downloadAllowed": true,
          "downloadUrl": "https://cdn.jamendo.com/download.mp3"
        }
      ],
      "total": 1
    }
  }
  ```

---

## 💬 Real-Time WebSockets Event Reference (`ws://localhost:3000`)
- **`live:join`**: `{ "streamId": "640000000000000000000201" }`
- **`live:leave`**: `{ "streamId": "640000000000000000000201" }`
- **`live:comment`**: `{ "streamId": "640000000000000000000201", "text": "Awesome clutch! 👌" }`
- **`live:like`**: `{ "streamId": "640000000000000000000201" }`
