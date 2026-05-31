# Auth Troubleshooting

---

## Edge Function Returns 401

**Symptom:** `POST /functions/v1/<name> 401`

**Cause checklist:**

1. **`SUPABASE_JWT_SECRET` mismatch** — the most common cause.
   - Open Supabase Dashboard → Settings → API → JWT Settings
   - Copy the JWT Secret exactly as shown
   - Paste into `server/.env` as `SUPABASE_JWT_SECRET=<value>`
   - Restart the NestJS server
   - The Edge Function receives the secret automatically; only the NestJS side can be wrong

2. **Bridge token not being sent** — `getBridgeToken()` returned null at call time.
   - Check that `setupSupabaseSession()` was called before the Edge Function invocation
   - Add a log: `console.log('[debug] bridge token:', getBridgeToken()?.slice(0, 20))`
   - Ensure `VITE_AUTH_PROVIDER=firebase` is set and the exchange succeeded

3. **Bridge token expired** — TTL is 1 hour; `onIdTokenChanged` should refresh it.
   - Check if Firebase `onIdTokenChanged` is firing (add a log in `useAuthStore.ts:283`)
   - Check if `/auth/refresh` is succeeding (look for `[bridge] ← 200 /auth/refresh` in console)

4. **Function deployed with wrong version** — older version without `verifyCallerJwt`.
   - Check Supabase Dashboard → Edge Functions → version number
   - Compare against the versions listed in `docs/auth/edge-function-auth.md`
   - Redeploy if needed: `supabase functions deploy <name>`

---

## REST Queries Return 406

**Symptom:** `GET /rest/v1/profiles?... 406 (Not Acceptable)`

**Cause:** `auth.uid()` returns null — the bridge token is not being sent, or `supabase-js` is overriding it with the anon key.

**Diagnosis:**
```typescript
// Add temporarily to supabase.ts fetchWithTimeout:
console.log('[fetch]', url, 'token:', _bridgeToken?.slice(0, 20) ?? 'null')
```

**Common causes:**
- `setBridgeToken()` was not called yet (auth exchange still in progress)
- `_bridgeToken` was cleared by `setBridgeToken(null)` prematurely
- The fetch URL contains `/auth/v1/` → token injection is skipped (correct behavior)

---

## `supabase.auth.getSession()` Returns Null

**Expected behavior in Firebase mode.** `setSession()` is never called (it validates against `auth.users` which doesn't contain Firebase-only users).

**Fix:** Replace all `supabase.auth.getSession().access_token` with `getBridgeToken()`:

```typescript
// ❌ Returns null in Firebase mode
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token  // null

// ✅ Correct
const token = getBridgeToken()
```

---

## Google Popup Blocked

**Symptom:** `auth/popup-blocked` error in console.

**Cause:** An `await` before `signInWithPopup()` breaks the browser's gesture chain.

**Fix:** `signInWithPopup()` must be called synchronously in the click handler, before any async work:

```typescript
// ❌ Popup blocked — async before signInWithPopup
const rl = await callRateLimit('oauth_initiate')  // this await breaks it
const credential = await signInWithPopup(firebaseAuth, provider)

// ✅ Correct — signInWithPopup is synchronous from the tap
const provider = new GoogleAuthProvider()
const credential = await signInWithPopup(firebaseAuth, provider)
// rate limit can be checked after
```

---

## Email Sign-In Returns "Email not verified"

**Symptom:** Sign-in throws with `code: 'email_not_verified'`.

**Cause:** `profiles.is_email_verified = false` — the user signed up but hasn't clicked the verification link.

**User action:** Check email inbox (including spam) for the DEVCON+ verification email. Click the link.

**If the link expired:** Go to `/email-sent` and request a new verification email. The resend flow calls `POST /auth/email/resend-verification`.

**Developer check:**
```sql
SELECT id, email, is_email_verified FROM profiles WHERE email = 'user@example.com';
-- If is_email_verified = false, user hasn't verified.
-- Manual override (dev only): UPDATE profiles SET is_email_verified = true WHERE email = '...';
```

---

## User Can't Sign In (Legacy Supabase Account)

**Symptom:** User previously signed in with Supabase Auth (before Firebase migration) and gets a sign-in error.

**Expected behavior:** The JIT fallback in `/auth/email/signin` should handle this automatically — it creates a Firebase user, links `auth_uid` on the profile, and returns a session.

**If the fallback fails:**
1. Check NestJS logs for `legacyEmailFallback` errors
2. Verify `FIREBASE_WEB_API_KEY` is set in `server/.env`
3. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct

---

## NestJS Bridge Not Reachable

**Symptom:** `[bridge] error from /auth/firebase/exchange: Bridge request failed: 503`

**Local development:**
- Make sure `cd server && npm run dev` is running on port 8000
- `VITE_API_URL=http://localhost:8000` in `web/.env.local`

**Production:**
- Cloud Run service is at the URL in `SERVER_URL`
- Check Cloud Run logs in Google Cloud Console
- Check `CORS_ORIGIN` in NestJS includes the Vercel deployment URL

---

## Points Not Showing (0 XP After Login)

**Symptom:** Dashboard shows 0 XP even though the user has earned points.

**Likely cause:** Supabase REST queries returning 406 (bridge token issue). Check the console for 406 errors.

**Fix:** Follow the "REST Queries Return 406" section above.

**Secondary cause:** `usePointsStore.loadTotalPoints()` not being called. Check `MemberLayout` is triggering `recover()` on mount.
