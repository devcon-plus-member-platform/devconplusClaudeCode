import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard, AUTHENTICATED_USER_KEY, AuthenticatedUser } from './auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { FirebaseService } from '../firebase/firebase.service';
import { SupabaseService } from '../supabase/supabase.service';

// ── Fixtures ─────────────────────────────────────────────────────────────

const MOCK_FIREBASE_UID = 'firebase-uid-abc123';

const MOCK_PROFILE = {
  id:               'profile-uuid-001',
  email:            'test@devcon.ph',
  full_name:        'Test User',
  auth_uid:         MOCK_FIREBASE_UID,
  is_email_verified: true,
  role:             'member',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string): Record<string, unknown> {
  return { headers: authHeader ? { authorization: authHeader } : {} };
}

function makeContext(authHeader?: string): ExecutionContext {
  const req = makeRequest(authHeader);
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeFirebase(tokenOverride?: Partial<{ uid: string; email_verified: boolean }>) {
  return {
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: MOCK_FIREBASE_UID,
      email_verified: true,
      ...tokenOverride,
    }),
  };
}

function makeSupabase(profile: unknown = MOCK_PROFILE) {
  return {
    findProfileByAuthUid: jest.fn().mockResolvedValue(profile),
  };
}

// Cache mock that always misses → guard falls through to the DB lookup,
// preserving the original (uncached) behavior these tests assert.
function makeCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

async function buildGuard(
  fbOverride?: Parameters<typeof makeFirebase>[0],
  profile?: unknown,
) {
  const firebase = makeFirebase(fbOverride);
  const supabase = makeSupabase(profile);
  const cache = makeCache();

  const module = await Test.createTestingModule({
    providers: [
      AuthGuard,
      { provide: FirebaseService, useValue: firebase },
      { provide: SupabaseService, useValue: supabase },
      { provide: AppCacheService, useValue: cache },
    ],
  }).compile();

  return { guard: module.get(AuthGuard), firebase, supabase, cache };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('AuthGuard', () => {

  describe('missing / malformed token', () => {
    it('throws when no Authorization header is present', async () => {
      const { guard } = await buildGuard();
      await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
    });

    it('throws when Authorization header is not Bearer format', async () => {
      const { guard } = await buildGuard();
      await expect(guard.canActivate(makeContext('Basic dXNlcjpwYXNz'))).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Firebase token verification', () => {
    it('throws when Firebase rejects the token (expired, wrong project, etc.)', async () => {
      const firebase = { verifyIdToken: jest.fn().mockRejectedValue(new Error('token expired')) };
      const supabase = makeSupabase();

      const module = await Test.createTestingModule({
        providers: [
          AuthGuard,
          { provide: FirebaseService, useValue: firebase },
          { provide: SupabaseService, useValue: supabase },
          { provide: AppCacheService, useValue: makeCache() },
        ],
      }).compile();

      const guard = module.get(AuthGuard);
      await expect(guard.canActivate(makeContext('Bearer bad.id.token'))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when email_verified=false on the decoded token', async () => {
      const { guard } = await buildGuard({ email_verified: false });
      await expect(guard.canActivate(makeContext('Bearer unverified.token'))).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('profile lookup', () => {
    it('throws when auth_uid is not linked to any profile (exchange not completed)', async () => {
      // null return: user signed into Firebase but never called /auth/firebase/exchange
      const { guard } = await buildGuard(undefined, null);
      await expect(guard.canActivate(makeContext('Bearer valid.token'))).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('happy path', () => {
    it('returns true and attaches AuthenticatedUser to the request', async () => {
      const { guard } = await buildGuard();
      const req = makeRequest('Bearer valid.firebase.id.token');
      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);

      const attached = req[AUTHENTICATED_USER_KEY] as AuthenticatedUser;
      expect(attached.firebaseUid).toBe(MOCK_FIREBASE_UID);
      expect(attached.profileId).toBe(MOCK_PROFILE.id);
      expect(attached.profile).toMatchObject({ email: MOCK_PROFILE.email });
    });
  });

  describe('auth-profile cache (hot path)', () => {
    it('on a cache MISS: hits the DB and caches the profile under its auth_uid', async () => {
      const { guard, supabase, cache } = await buildGuard();
      await guard.canActivate(makeContext('Bearer valid.token'));
      expect(supabase.findProfileByAuthUid).toHaveBeenCalledWith(MOCK_FIREBASE_UID);
      expect(cache.set).toHaveBeenCalledWith(
        `authprofile:${MOCK_FIREBASE_UID}`,
        MOCK_PROFILE,
        expect.any(Number),
      );
    });

    it('on a cache HIT: serves the cached profile without touching the DB', async () => {
      const { guard, supabase, cache } = await buildGuard();
      cache.get.mockResolvedValue(MOCK_PROFILE);
      const result = await guard.canActivate(makeContext('Bearer valid.token'));
      expect(result).toBe(true);
      expect(supabase.findProfileByAuthUid).not.toHaveBeenCalled();
    });

    it('never caches a null (unlinked) profile — avoids locking out the user', async () => {
      const { guard, cache } = await buildGuard(undefined, null);
      await expect(guard.canActivate(makeContext('Bearer valid.token'))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
