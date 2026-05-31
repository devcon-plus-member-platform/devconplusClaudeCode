# Auth Architecture

> Phase 4 (current) — Firebase Auth + NestJS JWT Bridge

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER (React)                         │
│                                                                  │
│  Firebase SDK          useAuthStore          supabase-js        │
│  ────────────          ────────────          ──────────         │
│  • Google popup        • holds Profile       • REST queries      │
│  • email/password      • holds bridge JWT    • Realtime subs     │
│  • onIdTokenChanged    • calls NestJS        • Storage uploads   │
│         │                    │                     │             │
└─────────┼────────────────────┼─────────────────────┼────────────┘
          │                    │                     │
          │ Firebase           │ HTTP (JWT exchange) │ Authorization:
          │ ID Token           │ /auth/firebase/     │ Bearer <bridge JWT>
          │                    │ exchange            │
          ▼                    ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│  Firebase Auth  │  │  NestJS Bridge  │  │  Supabase PostgREST │
│  (Google Cloud) │  │  (Cloud Run)    │  │  + Realtime         │
│                 │  │                 │  │  + Storage          │
│ • Verifies ID   │  │ • Verifies ID   │  │                     │
│   tokens        │  │   token         │  │ • Validates JWT sig  │
│ • Manages       │  │ • Looks up      │  │   with SUPABASE_     │
│   Firebase      │  │   profiles.id   │  │   JWT_SECRET        │
│   users         │  │ • Signs bridge  │  │ • auth.uid() = sub   │
│                 │  │   JWT (HS256)   │  │   (profiles.id)     │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
```

---

## Token Flow

### 1. Google OAuth Sign-In

```
User clicks "Sign in with Google"
    │
    ▼
Firebase signInWithPopup()
    │
    ├── Firebase ID Token (short-lived, signed by Google)
    │
    ▼
POST /auth/firebase/exchange  { id_token }
    │
    ├── NestJS verifies ID token via Firebase Admin SDK
    ├── Looks up profiles.id by firebase_uid (or auth_uid)
    ├── Signs bridge JWT: { sub: profiles.id, role: 'authenticated', aud: 'authenticated' }
    │
    ▼
BridgeSession { access_token, refresh_token, profile }
    │
    ├── setBridgeToken(access_token)   → injected into all supabase-js fetch calls
    ├── supabase.realtime.setAuth()    → injected into WebSocket channels
    └── store.user = profile           → UI renders immediately
```

### 2. Email/Password Sign-In

```
User submits email + password
    │
    ▼
POST /auth/email/signin  { email, password }
    │
    ├── NestJS verifies via Firebase REST API
    ├── Falls back to Supabase Auth if no Firebase account (JIT migration)
    │   └── On success: creates Firebase user, links auth_uid, migrates on the spot
    ├── Gates on profiles.is_email_verified = true
    │
    ▼
BridgeSession { access_token, refresh_token, profile }
    │
    └── Same setBridgeToken() path as Google OAuth
```

### 3. Token Refresh (~every 1 hour)

```
Firebase onIdTokenChanged fires
    │
    ▼
POST /auth/refresh  { id_token: freshFirebaseToken }
    │
    ├── NestJS re-signs bridge JWT
    │
    ▼
setBridgeToken(newAccessToken)   → all subsequent supabase-js calls use the new token
```

---

## Key Secrets

| Secret | Where set | Used by |
|---|---|---|
| `SUPABASE_JWT_SECRET` | NestJS `.env`, auto-injected into Edge Functions | NestJS signs bridge JWTs; Edge Functions verify them |
| `QR_JWT_SECRET` | Supabase Edge Function secrets | QR token generation and verification only |
| `EMAIL_VERIFICATION_SECRET` | NestJS `.env` | Email verification link JWTs |
| Firebase Service Account JSON | NestJS `.env` | Firebase Admin SDK (verify ID tokens, create users) |
| `FIREBASE_WEB_API_KEY` | NestJS `.env` | Firebase REST API (email/password credential check) |

---

## Database Identity Mapping

```
Firebase Auth
  └── User (UID: "firebase-abc123")
        └── linked via profiles.auth_uid = "firebase-abc123"

Supabase profiles table
  └── id: "550e8400-e29b-41d4-a716-446655440000"  ← this is what auth.uid() returns
        └── auth_uid: "firebase-abc123"
        └── email: "user@example.com"
        └── role: "member" | "chapter_officer" | ...

Bridge JWT payload
  └── sub: "550e8400-e29b-41d4-a716-446655440000"  ← profiles.id
        └── role: "authenticated"
        └── aud: "authenticated"
        └── exp: <1 hour TTL>
```

`auth.uid()` in Supabase RLS policies reads the `sub` claim from the JWT, which equals `profiles.id`. All existing RLS policies continue to work unchanged.
