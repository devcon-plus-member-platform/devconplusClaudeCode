import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, AuthenticatedUser } from './auth.guard';

// ── Mock factories ────────────────────────────────────────────────────────

function makeAuthService() {
  return {
    exchangeFirebaseToken: jest.fn().mockResolvedValue({ access_token: 'tok', refresh_token: 'ref', profile: {} }),
    refresh:               jest.fn().mockResolvedValue({ access_token: 'tok', refresh_token: 'ref', profile: {} }),
    emailSignup:           jest.fn().mockResolvedValue({ message: 'Account created.' }),
    emailSignin:           jest.fn().mockResolvedValue({ access_token: 'tok', refresh_token: 'ref', profile: {} }),
    emailReset:            jest.fn().mockResolvedValue({ message: 'Reset link sent.' }),
    verifyEmail:           jest.fn().mockResolvedValue('http://localhost:5173/email-confirm?status=success'),
    resendVerification:    jest.fn().mockResolvedValue({ message: 'Resent.' }),
    deleteAccount:         jest.fn().mockResolvedValue({ message: 'Account deleted.' }),
  };
}

function makeConfig() {
  return {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        SUPABASE_URL:         'https://example.supabase.co',
        FIREBASE_WEB_API_KEY: 'test-firebase-api-key',
      };
      if (key in map) return map[key];
      throw new Error(`Missing env: ${key}`);
    }),
  };
}

const MOCK_AUTH_USER: AuthenticatedUser = {
  firebaseUid: 'firebase-uid-abc123',
  profileId:   'profile-uuid',
  profile:     {} as AuthenticatedUser['profile'],
};

// ── Suite ─────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof makeAuthService>;

  beforeEach(async () => {
    authService = makeAuthService();

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService,    useValue: authService },
        { provide: ConfigService,  useValue: makeConfig() },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  // ── POST /auth/firebase/exchange ─────────────────────────────────────

  describe('exchange', () => {
    it('delegates id_token to auth.exchangeFirebaseToken', async () => {
      await controller.exchange({ id_token: 'firebase.id.token' });
      expect(authService.exchangeFirebaseToken).toHaveBeenCalledWith('firebase.id.token');
    });

    it('returns the bridge session from the service', async () => {
      const result = await controller.exchange({ id_token: 'tok' });
      expect(result).toEqual({ access_token: 'tok', refresh_token: 'ref', profile: {} });
    });
  });

  // ── POST /auth/refresh ───────────────────────────────────────────────

  describe('refresh', () => {
    it('delegates id_token to auth.refresh', async () => {
      await controller.refresh({ id_token: 'fresh.token' });
      expect(authService.refresh).toHaveBeenCalledWith('fresh.token');
    });
  });

  // ── POST /auth/email/signup ──────────────────────────────────────────

  describe('signup', () => {
    it('passes all required fields to emailSignup', async () => {
      await controller.signup({
        email:            'user@devcon.ph',
        password:         'Password123!',
        full_name:        'Test User',
        username:         'testuser',
        chapter_id:       'chapter-uuid',
        school_or_company: 'Acme Corp',
      });
      expect(authService.emailSignup).toHaveBeenCalledWith({
        email:            'user@devcon.ph',
        password:         'Password123!',
        full_name:        'Test User',
        username:         'testuser',
        chapter_id:       'chapter-uuid',
        school_or_company: 'Acme Corp',
      });
    });

    it('passes undefined for omitted optional fields', async () => {
      await controller.signup({ email: 'user@devcon.ph', password: 'Password123!', full_name: 'Test' });
      expect(authService.emailSignup).toHaveBeenCalledWith(
        expect.objectContaining({ username: undefined, chapter_id: undefined }),
      );
    });
  });

  // ── POST /auth/email/signin ──────────────────────────────────────────

  describe('signin', () => {
    it('injects FIREBASE_WEB_API_KEY from config into the service call', async () => {
      await controller.signin({ email: 'user@devcon.ph', password: 'pw' });
      expect(authService.emailSignin).toHaveBeenCalledWith({
        email:             'user@devcon.ph',
        password:          'pw',
        firebaseWebApiKey: 'test-firebase-api-key',
      });
    });
  });

  // ── POST /auth/email/reset ───────────────────────────────────────────

  describe('reset', () => {
    it('injects SUPABASE_URL from config into the service call', async () => {
      await controller.reset({ email: 'user@devcon.ph' });
      expect(authService.emailReset).toHaveBeenCalledWith(
        'user@devcon.ph',
        'https://example.supabase.co',
      );
    });
  });

  // ── GET /auth/email/verify ───────────────────────────────────────────

  describe('verifyEmail', () => {
    it('returns { url } wrapper required by @Redirect()', async () => {
      const result = await controller.verifyEmail('valid.token');
      expect(result).toEqual({ url: 'http://localhost:5173/email-confirm?status=success' });
    });

    it('passes empty string to service when token query param is missing', async () => {
      // NestJS @Query() returns undefined when the param is absent — controller guards with `?? ''`
      await controller.verifyEmail(undefined as unknown as string);
      expect(authService.verifyEmail).toHaveBeenCalledWith('');
    });
  });

  // ── POST /auth/email/resend-verification ────────────────────────────

  describe('resendVerification', () => {
    it('delegates email to auth.resendVerification', async () => {
      await controller.resendVerification({ email: 'user@devcon.ph' });
      expect(authService.resendVerification).toHaveBeenCalledWith('user@devcon.ph');
    });
  });

  // ── DELETE /auth/account ─────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('passes id_token to auth.deleteAccount (ignores the @CurrentUser injection)', async () => {
      await controller.deleteAccount({ id_token: 'delete.tok' }, MOCK_AUTH_USER);
      expect(authService.deleteAccount).toHaveBeenCalledWith('delete.tok');
    });
  });
});
