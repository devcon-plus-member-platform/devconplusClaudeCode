# Auth Flows

---

## Google OAuth Sign-In

```
1. User taps "Continue with Google"
2. signInWithPopup(firebaseAuth, GoogleAuthProvider)   ← must be synchronous from tap gesture
3. Firebase returns credential (FirebaseUser + ID token)
4. POST /auth/firebase/exchange { id_token }
5. NestJS: verifyIdToken → findProfile → signBridgeJwt
6. applyProfile(session.profile, set)   ← sets store.user immediately
7. setupSupabaseSession(session)        ← setBridgeToken(access_token)
8. navigate('/home')
```

**Key constraint:** `signInWithPopup()` must be called synchronously from the click handler. Any `await` before it breaks the browser popup gesture chain → `auth/popup-blocked`.

---

## Email/Password Sign-Up

```
1. User fills sign-up form (name, email, password, chapter, username)
2. POST /auth/email/signup { email, password, full_name, username, chapter_id }
3. NestJS:
   a. Check for existing profile by email → throw ConflictException if exists
   b. firebase.auth.createUser({ email, password, displayName })
   c. createProfileWithBonus({ id: randomUUID(), auth_uid: firebaseUid, ... })
      → profile created with is_email_verified = false
      → 500pt bonus NOT awarded yet (gated on is_email_verified)
   d. signVerificationToken(firebaseUid, email) → JWT signed with EMAIL_VERIFICATION_SECRET
   e. EmailService.sendVerificationEmail(email, token)
4. Frontend receives { emailConfirmationPending: true }
5. Redirect to /email-sent
```

---

## Email Verification

```
1. User clicks link in email: GET /auth/email/verify?token=<jwt>
2. NestJS:
   a. jwt.verify(token, EMAIL_VERIFICATION_SECRET)
   b. firebase.auth.updateUser(uid, { emailVerified: true })
   c. supabase.setEmailVerified(profile.id)          → profiles.is_email_verified = true
   d. award_signup_bonus_for_verified(profile.id)    → +500 pts, point_transaction inserted
3. Redirect to frontend /email-confirm
4. /email-confirm page calls exchangeFirebaseToken → full session established
```

---

## Email/Password Sign-In

```
1. User submits email + password
2. POST /auth/email/signin { email, password }
3. NestJS checks for Firebase user:
   │
   ├── Firebase user EXISTS:
   │   a. Verify password via Firebase REST API
   │   b. Gate: profiles.is_email_verified = true (else throw UnauthorizedException)
   │   c. Sign bridge JWT → return BridgeSession
   │
   └── Firebase user NOT FOUND (legacy Supabase-only account):
       a. POST Supabase Auth REST /token (verify credentials)
       b. If valid: firebase.auth.createUser (migrate to Firebase)
       c. supabase.linkAuthUid(profile.id, newFirebaseUid)
       d. Sign bridge JWT → return BridgeSession
       e. Next sign-in: goes through Firebase directly (JIT complete)
4. Frontend: applyProfile → setBridgeToken → navigate('/home')
```

**Note:** If `is_email_verified = false`, sign-in throws with `code: 'email_not_verified'`. The `SignIn` page catches this and redirects to `/email-sent`.

---

## Token Refresh (~every 1 hour)

```
Firebase onIdTokenChanged fires with new FirebaseUser
    │
    ├── if !store.user: return (sign-in flow handles first exchange)
    │
    └── POST /auth/refresh { id_token: freshFirebaseToken }
        │
        └── setBridgeToken(newAccessToken)
            → all subsequent supabase-js calls use the refreshed token
```

Firebase silently refreshes its own token and calls `onIdTokenChanged`. The bridge follows by re-signing the Supabase JWT. No UI impact — user stays logged in.

---

## Sign-Out

```
1. store.signOut()
2. firebaseAuth.signOut()
   → triggers onIdTokenChanged(null)
   → setBridgeToken(null)          ← clears Authorization from all future requests
   → set({ user: null, ... })
   → supabase.auth.signOut()       ← clears any stored Supabase session (defensive)
3. Router redirects to /sign-in
```

---

## Password Reset

```
1. User submits email on /forgot-password
2. store.resetPassword(email)
3. supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })
   ← still uses Supabase Auth for this (legacy path, not yet migrated to Firebase)
4. Redirect to /email-sent
5. User clicks link → /reset-password
6. User sets new password
7. supabase.auth.updateUser({ password })
```

Password reset is still on the Supabase Auth path. Migration to Firebase is planned in a later phase.

---

## Session Restore on Page Refresh

```
App mounts → useAuthStore.initialize()
    │
    └── onAuthStateChanged (one-shot)
        │
        ├── firebaseUser present (active Firebase session):
        │   a. getIdToken(firebaseUser)
        │   b. POST /auth/firebase/exchange
        │   c. applyProfile → setBridgeToken
        │   d. redirect away from auth pages if needed
        │
        └── firebaseUser null:
            → isInitialized = true, user = null
            → MemberLayout redirects to /sign-in if route requires auth
```

Firebase persists the session in `localStorage` via its own IndexedDB/localStorage storage. On refresh, `onAuthStateChanged` fires immediately with the cached user, then the app re-exchanges for a fresh bridge JWT.
