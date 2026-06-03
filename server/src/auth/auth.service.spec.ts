import { BadRequestException, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../email/email.service';
import { FirebaseService } from '../firebase/firebase.service';
import { SupabaseJwtService } from '../supabase/supabase-jwt.service';
import { SupabaseService } from '../supabase/supabase.service';
import { Profile } from '../supabase/types';
import { AuthService } from './auth.service';

// ── Fixtures ─────────────────────────────────────────────────────────────

const MOCK_FIREBASE_UID = 'firebase-uid-abc123';
const MOCK_EMAIL = 'test@devcon.ph';
const MOCK_PROFILE_ID = '4a8e1b7c-0000-0000-0000-000000000001';

const mockDecodedToken = {
  uid: MOCK_FIREBASE_UID,
  email: MOCK_EMAIL,
  email_verified: true,
  name: 'Test User',
};

const mockProfile: Profile = {
  id: MOCK_PROFILE_ID,
  email: MOCK_EMAIL,
  full_name: 'Test User',
  username: 'testuser',
  school_or_company: null,
  chapter_id: 'chapter-uuid',
  role: 'member',
  avatar_url: null,
  spendable_points: 100,
  lifetime_points: 100,
  referral_code: null,
  pending_role: null,
  pending_chapter_id: null,
  auth_uid: MOCK_FIREBASE_UID,
  is_email_verified: true,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  created_at: '2026-05-28T00:00:00Z',
};

// ── Mock factories ────────────────────────────────────────────────────────

function makeFirebase(overrides: Partial<typeof FirebaseService.prototype> = {}) {
  return {
    verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken),
    auth: {
      getUser: jest.fn().mockResolvedValue({ customClaims: {} }),
      createUser: jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID }),
      getUserByEmail: jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID, emailVerified: false }),
      updateUser: jest.fn().mockResolvedValue(undefined),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      generatePasswordResetLink: jest.fn().mockResolvedValue('https://reset.link'),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeSupabase(overrides: Partial<SupabaseService> = {}) {
  return {
    findProfileByAuthUid: jest.fn().mockResolvedValue(null),
    findProfileByEmail: jest.fn().mockResolvedValue(null),
    linkAuthUidToProfile: jest.fn().mockResolvedValue(mockProfile),
    createProfileWithBonus: jest.fn().mockResolvedValue(mockProfile),
    setEmailVerified: jest.fn().mockResolvedValue(undefined),
    raw: { rpc: jest.fn().mockResolvedValue({ error: null }) },
    ...overrides,
  };
}

function makeEmail() {
  return { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
}

const MOCK_EMAIL_SECRET = 'test-email-verification-secret-32chars!!';
const MOCK_APP_URL = 'http://localhost:5173';

function makeConfig() {
  return {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        EMAIL_VERIFICATION_SECRET: MOCK_EMAIL_SECRET,
        APP_URL: MOCK_APP_URL,
        FIREBASE_WEB_API_KEY: 'test-api-key',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      };
      if (key in map) return map[key];
      throw new Error(`Missing env: ${key}`);
    }),
  };
}

function makeJwt() {
  return { signBridgeJwt: jest.fn().mockReturnValue('mock.jwt.token') };
}

// ── Test suite ────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let firebase: ReturnType<typeof makeFirebase>;
  let supabase: ReturnType<typeof makeSupabase>;

  let email: ReturnType<typeof makeEmail>;

  async function build(
    fbOverrides: Parameters<typeof makeFirebase>[0] = {},
    sbOverrides: Parameters<typeof makeSupabase>[0] = {},
  ) {
    firebase = makeFirebase(fbOverrides);
    supabase = makeSupabase(sbOverrides);
    email = makeEmail();
    const jwt = makeJwt();
    const config = makeConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: FirebaseService, useValue: firebase },
        { provide: SupabaseService, useValue: supabase },
        { provide: SupabaseJwtService, useValue: jwt },
        { provide: EmailService, useValue: email },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AuthService);
  }

  // ── exchangeFirebaseToken ──────────────────────────────────────────────

  describe('exchangeFirebaseToken', () => {
    it('returns session for already-linked user (auth_uid lookup)', async () => {
      await build({}, { findProfileByAuthUid: jest.fn().mockResolvedValue(mockProfile) });
      const session = await service.exchangeFirebaseToken('valid-id-token');

      expect(session.access_token).toBe('mock.jwt.token');
      expect(session.profile.id).toBe(MOCK_PROFILE_ID);
      expect(supabase.findProfileByEmail).not.toHaveBeenCalled();
      expect(supabase.createProfileWithBonus).not.toHaveBeenCalled();
    });

    it('JIT-links by email when auth_uid not found', async () => {
      await build(
        {},
        {
          findProfileByAuthUid: jest.fn().mockResolvedValue(null),
          findProfileByEmail: jest.fn().mockResolvedValue({
            ...mockProfile,
            auth_uid: null,
          }),
        },
      );
      const session = await service.exchangeFirebaseToken('valid-id-token');

      // Third arg (emailVerified=true) must be passed so linkAuthUidToProfile
      // backfills is_email_verified=true on pre-existing rows (column added after
      // accounts were created via Supabase Auth — existing rows have NULL).
      expect(supabase.linkAuthUidToProfile).toHaveBeenCalledWith(
        MOCK_PROFILE_ID,
        MOCK_FIREBASE_UID,
        true,
      );
      expect(session.profile.id).toBe(MOCK_PROFILE_ID);
      expect(supabase.createProfileWithBonus).not.toHaveBeenCalled();
    });

    it('creates new profile when neither auth_uid nor email matched', async () => {
      await build();
      const session = await service.exchangeFirebaseToken('valid-id-token');

      expect(supabase.createProfileWithBonus).toHaveBeenCalledWith(
        expect.objectContaining({
          email: MOCK_EMAIL,
          auth_uid: MOCK_FIREBASE_UID,
        }),
      );
      expect(session.profile.id).toBe(MOCK_PROFILE_ID);
    });

    it('rejects when profile.is_email_verified=false (DB gate)', async () => {
      await build(
        {},
        {
          findProfileByAuthUid: jest.fn().mockResolvedValue({
            ...mockProfile,
            is_email_verified: false,
          }),
        },
      );

      await expect(service.exchangeFirebaseToken('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects JIT-link when Firebase email unverified (account takeover prevention)', async () => {
      await build(
        {
          verifyIdToken: jest.fn().mockResolvedValue({
            ...mockDecodedToken,
            email_verified: false,
          }),
        },
        {
          findProfileByAuthUid: jest.fn().mockResolvedValue(null),
          findProfileByEmail: jest.fn().mockResolvedValue({
            ...mockProfile,
            auth_uid: null,
          }),
        },
      );

      await expect(service.exchangeFirebaseToken('unverified-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(supabase.linkAuthUidToProfile).not.toHaveBeenCalled();
    });

    it('rejects token with no email claim', async () => {
      await build({
        verifyIdToken: jest.fn().mockResolvedValue({
          ...mockDecodedToken,
          email: undefined,
        }),
      });

      await expect(service.exchangeFirebaseToken('no-email-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid Firebase token', async () => {
      await build({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('Firebase: invalid token')),
      });

      await expect(service.exchangeFirebaseToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns new session for a known user', async () => {
      await build({}, { findProfileByAuthUid: jest.fn().mockResolvedValue(mockProfile) });
      const session = await service.refresh('fresh-id-token');

      expect(session.access_token).toBe('mock.jwt.token');
      expect(session.profile.id).toBe(MOCK_PROFILE_ID);
    });

    it('throws if profile not found (user was deleted)', async () => {
      await build();
      await expect(service.refresh('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws if profile.is_email_verified=false (DB gate)', async () => {
      await build(
        {},
        {
          findProfileByAuthUid: jest.fn().mockResolvedValue({
            ...mockProfile,
            is_email_verified: false,
          }),
        },
      );
      await expect(service.refresh('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── emailReset ─────────────────────────────────────────────────────────

  describe('emailReset', () => {
    it('calls Firebase for migrated user', async () => {
      await build(
        {},
        {
          findProfileByEmail: jest.fn().mockResolvedValue(mockProfile),
        },
      );
      const result = await service.emailReset(MOCK_EMAIL, 'https://supabase.co');

      expect(firebase.auth.generatePasswordResetLink).toHaveBeenCalledWith(MOCK_EMAIL);
      expect(result.message).toContain('password reset link');
    });

    it('always returns 200 even when email not found (no enumeration)', async () => {
      await build();
      const result = await service.emailReset('nobody@devcon.ph', 'https://supabase.co');
      expect(result.message).toBeTruthy();
    });

    it('uses Supabase REST for legacy user whose auth_uid is null', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true } as Response);
      await build(
        {},
        {
          findProfileByEmail: jest.fn().mockResolvedValue({ ...mockProfile, auth_uid: null }),
        },
      );

      await service.emailReset(MOCK_EMAIL, 'https://supabase.co');

      expect(firebase.auth.generatePasswordResetLink).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/v1/recover'),
        expect.any(Object),
      );
      fetchSpy.mockRestore();
    });
  });

  // ── emailSignup ────────────────────────────────────────────────────────

  describe('emailSignup', () => {
    it('creates Firebase user, profile row, and sends verification email', async () => {
      await build();
      await service.emailSignup({
        email: MOCK_EMAIL,
        password: 'Password123!',
        full_name: 'Test User',
      });

      expect(firebase.auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: MOCK_EMAIL, emailVerified: false }),
      );
      expect(supabase.createProfileWithBonus).toHaveBeenCalledWith(
        expect.objectContaining({
          email: MOCK_EMAIL,
          is_email_verified: false,
        }),
      );
      expect(email.sendVerificationEmail).toHaveBeenCalledWith(
        MOCK_EMAIL,
        expect.any(String),
      );
    });

    it('returns success message even when email send fails', async () => {
      const emailFail = { sendVerificationEmail: jest.fn().mockRejectedValue(new Error('SMTP error')) };
      await build();
      // Patch email mock to fail
      Object.assign(email, emailFail);

      const result = await service.emailSignup({
        email: MOCK_EMAIL,
        password: 'Password123!',
        full_name: 'Test User',
      });

      expect(result.message).toContain('Check your email');
    });

    it('throws ConflictException when email already exists in profiles table', async () => {
      await build({}, { findProfileByEmail: jest.fn().mockResolvedValue(mockProfile) });
      await expect(
        service.emailSignup({ email: MOCK_EMAIL, password: 'Password123!', full_name: 'Test' }),
      ).rejects.toThrow(ConflictException);
      expect(firebase.auth.createUser).not.toHaveBeenCalled();
    });

    it('throws ConflictException when Firebase already owns the email', async () => {
      await build();
      firebase.auth.createUser = jest.fn().mockRejectedValue(
        Object.assign(new Error(), { code: 'auth/email-already-exists' }),
      );
      await expect(
        service.emailSignup({ email: MOCK_EMAIL, password: 'Password123!', full_name: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── verifyEmail ────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    function makeValidToken(): string {
      // Sign a real JWT with the test secret so verifyEmail can decode it
      const { sign } = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
      return sign(
        { sub: MOCK_FIREBASE_UID, email: MOCK_EMAIL, purpose: 'email_verify' },
        MOCK_EMAIL_SECRET,
        { expiresIn: '24h' },
      ) as string;
    }

    it('marks Firebase user verified and sets is_email_verified on profile', async () => {
      await build({}, { findProfileByEmail: jest.fn().mockResolvedValue(mockProfile) });

      const token = makeValidToken();
      const redirectUrl = await service.verifyEmail(token);

      expect(redirectUrl).toContain('status=success');
      expect(firebase.auth.updateUser).toHaveBeenCalledWith(MOCK_FIREBASE_UID, { emailVerified: true });
      expect(supabase.setEmailVerified).toHaveBeenCalledWith(MOCK_PROFILE_ID);
    });

    it('returns error redirect for expired/invalid token', async () => {
      await build();
      const redirectUrl = await service.verifyEmail('not-a-valid-jwt');
      expect(redirectUrl).toContain('status=error');
    });

    it('returns error redirect for wrong purpose claim', async () => {
      const { sign } = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
      const wrongToken = sign(
        { sub: MOCK_FIREBASE_UID, email: MOCK_EMAIL, purpose: 'wrong_purpose' },
        MOCK_EMAIL_SECRET,
        { expiresIn: '24h' },
      ) as string;

      await build();
      const redirectUrl = await service.verifyEmail(wrongToken);
      expect(redirectUrl).toContain('status=error');
    });

    it('returns error redirect when Firebase updateUser throws', async () => {
      await build({}, { findProfileByEmail: jest.fn().mockResolvedValue(mockProfile) });
      firebase.auth.updateUser = jest.fn().mockRejectedValue(new Error('firebase-user-not-found'));
      const token = makeValidToken();
      const redirectUrl = await service.verifyEmail(token);
      expect(redirectUrl).toContain('status=error');
      expect(supabase.setEmailVerified).not.toHaveBeenCalled();
    });

    it('still returns success when setEmailVerified fails (non-fatal DB error)', async () => {
      await build(
        {},
        {
          findProfileByEmail: jest.fn().mockResolvedValue(mockProfile),
          setEmailVerified: jest.fn().mockRejectedValue(new Error('db error')),
        },
      );
      const token = makeValidToken();
      const redirectUrl = await service.verifyEmail(token);
      // Firebase was updated; DB failure is logged and swallowed — user is verified
      expect(redirectUrl).toContain('status=success');
    });
  });

  // ── resendVerification ─────────────────────────────────────────────────

  describe('resendVerification', () => {
    it('sends verification email for unverified user', async () => {
      await build();
      firebase.auth.getUserByEmail = jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID, emailVerified: false });

      await service.resendVerification(MOCK_EMAIL);
      expect(email.sendVerificationEmail).toHaveBeenCalledWith(MOCK_EMAIL, expect.any(String));
    });

    it('returns 200 silently for already-verified user (no enumeration)', async () => {
      await build();
      firebase.auth.getUserByEmail = jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID, emailVerified: true });

      const result = await service.resendVerification(MOCK_EMAIL);
      expect(result.message).toBeTruthy();
      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns 200 silently for unknown email (no enumeration)', async () => {
      await build();
      firebase.auth.getUserByEmail = jest.fn().mockRejectedValue(new Error('user-not-found'));

      const result = await service.resendVerification('nobody@devcon.ph');
      expect(result.message).toBeTruthy();
      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // ── emailSignin ────────────────────────────────────────────────────────

  describe('emailSignin', () => {
    const MOCK_API_KEY = 'test-firebase-web-api-key';
    const MOCK_ID_TOKEN = 'firebase.id.token';

    // Helper: mock the global fetch used for Firebase REST sign-in
    function mockFirebaseRest(ok: boolean, idToken?: string) {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok,
        json: async () =>
          ok
            ? { idToken }
            : { error: { message: 'INVALID_PASSWORD' } },
      } as Response);
    }

    // Helper: mock the Supabase Auth REST fallback fetch
    function mockSupabaseRest(ok: boolean) {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok,
        json: async () => (ok ? { access_token: 'sb.token' } : { error: 'invalid_grant' }),
      } as Response);
    }

    afterEach(() => jest.restoreAllMocks());

    it('returns session when Firebase user exists and password is correct', async () => {
      await build({}, { findProfileByAuthUid: jest.fn().mockResolvedValue(mockProfile) });
      // getUserByEmail → user found (default mock)
      mockFirebaseRest(true, MOCK_ID_TOKEN);

      const session = await service.emailSignin({
        email: MOCK_EMAIL,
        password: 'Password123!',
        firebaseWebApiKey: MOCK_API_KEY,
      });

      expect(session.access_token).toBe('mock.jwt.token');
      // Firebase REST was called (not the legacy fallback)
      expect(firebase.auth.createUser).not.toHaveBeenCalled();
    });

    it('throws when Firebase user exists but password is wrong', async () => {
      await build();
      // getUserByEmail → user found
      mockFirebaseRest(false);

      await expect(
        service.emailSignin({ email: MOCK_EMAIL, password: 'wrong', firebaseWebApiKey: MOCK_API_KEY }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('JIT-migrates legacy user: creates Firebase user and returns session', async () => {
      await build(
        {},
        {
          findProfileByAuthUid: jest.fn().mockResolvedValue(null),
          findProfileByEmail: jest.fn().mockResolvedValue(mockProfile),
          linkAuthUidToProfile: jest.fn().mockResolvedValue(mockProfile),
        },
      );
      // User not in Firebase yet
      firebase.auth.getUserByEmail = jest.fn().mockRejectedValue(
        Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' }),
      );
      firebase.auth.createUser = jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID });

      mockSupabaseRest(true);

      const session = await service.emailSignin({
        email: MOCK_EMAIL,
        password: 'Password123!',
        firebaseWebApiKey: MOCK_API_KEY,
      });

      expect(firebase.auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: MOCK_EMAIL, emailVerified: true }),
      );
      expect(supabase.linkAuthUidToProfile).toHaveBeenCalledWith(MOCK_PROFILE_ID, MOCK_FIREBASE_UID);
      expect(session.access_token).toBe('mock.jwt.token');
    });

    it('throws when Firebase user not found and Supabase Auth rejects (wrong password)', async () => {
      await build();
      firebase.auth.getUserByEmail = jest.fn().mockRejectedValue(
        Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' }),
      );

      mockSupabaseRest(false);

      await expect(
        service.emailSignin({ email: MOCK_EMAIL, password: 'wrong', firebaseWebApiKey: MOCK_API_KEY }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws InternalServerErrorException when Supabase Auth succeeds but no profile exists', async () => {
      await build(
        {},
        { findProfileByEmail: jest.fn().mockResolvedValue(null) },
      );
      firebase.auth.getUserByEmail = jest.fn().mockRejectedValue(
        Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' }),
      );
      firebase.auth.createUser = jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID });

      mockSupabaseRest(true);

      await expect(
        service.emailSignin({ email: MOCK_EMAIL, password: 'Password123!', firebaseWebApiKey: MOCK_API_KEY }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('handles race condition: auth/email-already-exists falls back to getUserByEmail for UID', async () => {
      await build(
        {},
        {
          findProfileByAuthUid: jest.fn().mockResolvedValue(null),
          findProfileByEmail: jest.fn().mockResolvedValue(mockProfile),
          linkAuthUidToProfile: jest.fn().mockResolvedValue(mockProfile),
        },
      );
      // First call in emailSignin: user not in Firebase → triggers legacy fallback.
      // Second call in legacyEmailFallback (after createUser race conflict): returns UID.
      firebase.auth.getUserByEmail = jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error(), { code: 'auth/user-not-found' }))
        .mockResolvedValueOnce({ uid: MOCK_FIREBASE_UID });
      firebase.auth.createUser = jest.fn().mockRejectedValue(
        Object.assign(new Error(), { code: 'auth/email-already-exists' }),
      );
      mockSupabaseRest(true);

      const session = await service.emailSignin({
        email: MOCK_EMAIL,
        password: 'Password123!',
        firebaseWebApiKey: MOCK_API_KEY,
      });

      expect(supabase.linkAuthUidToProfile).toHaveBeenCalledWith(MOCK_PROFILE_ID, MOCK_FIREBASE_UID);
      expect(session.access_token).toBe('mock.jwt.token');
    });

    it('throws InternalServerException when Admin SDK returns an unexpected error', async () => {
      await build();
      firebase.auth.getUserByEmail = jest.fn().mockRejectedValue(
        Object.assign(new Error('network error'), { code: 'auth/internal-error' }),
      );

      await expect(
        service.emailSignin({ email: MOCK_EMAIL, password: 'bad', firebaseWebApiKey: MOCK_API_KEY }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws UnauthorizedException when legacy user is_email_verified=false', async () => {
      await build(
        {},
        {
          findProfileByEmail: jest.fn().mockResolvedValue({ ...mockProfile, is_email_verified: false }),
          linkAuthUidToProfile: jest.fn().mockResolvedValue({ ...mockProfile, is_email_verified: false }),
        },
      );
      firebase.auth.getUserByEmail = jest.fn().mockRejectedValue(
        Object.assign(new Error(), { code: 'auth/user-not-found' }),
      );
      firebase.auth.createUser = jest.fn().mockResolvedValue({ uid: MOCK_FIREBASE_UID });
      mockSupabaseRest(true);

      await expect(
        service.emailSignin({ email: MOCK_EMAIL, password: 'Password123!', firebaseWebApiKey: MOCK_API_KEY }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── deleteAccount ──────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('calls RPC cascade and Firebase deleteUser', async () => {
      await build({}, { findProfileByAuthUid: jest.fn().mockResolvedValue(mockProfile) });
      const result = await service.deleteAccount('valid-token');

      expect(supabase.raw.rpc).toHaveBeenCalledWith('delete_own_account');
      expect(firebase.auth.deleteUser).toHaveBeenCalledWith(MOCK_FIREBASE_UID);
      expect(result.message).toContain('deleted');
    });

    it('throws UnauthorizedException when profile not found', async () => {
      await build();
      await expect(service.deleteAccount('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws InternalServerException when Supabase RPC fails', async () => {
      await build({}, { findProfileByAuthUid: jest.fn().mockResolvedValue(mockProfile) });
      // Patch raw.rpc after build — passing it as an sbOverride would fail TS because
      // SupabaseService.raw is typed as full SupabaseClient, not just { rpc }.
      supabase.raw.rpc = jest.fn().mockResolvedValue({ error: { message: 'cascade failed' } });

      await expect(service.deleteAccount('valid-token')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(firebase.auth.deleteUser).not.toHaveBeenCalled();
    });

    it('still returns success when Firebase deleteUser fails (non-fatal)', async () => {
      await build({}, { findProfileByAuthUid: jest.fn().mockResolvedValue(mockProfile) });
      firebase.auth.deleteUser = jest.fn().mockRejectedValue(new Error('firebase-user-not-found'));

      const result = await service.deleteAccount('valid-token');
      expect(result.message).toContain('deleted');
    });
  });
});
