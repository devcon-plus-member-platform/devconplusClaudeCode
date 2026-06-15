import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { EmailService } from '../email/email.service';
import { FirebaseService } from '../firebase/firebase.service';
import { SupabaseJwtService } from '../supabase/supabase-jwt.service';
import { SupabaseService } from '../supabase/supabase.service';
import { Profile } from '../supabase/types';
import { BridgeSession } from './types';

interface VerificationPayload {
  sub: string;   // Firebase UID
  email: string;
  purpose: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly supabase: SupabaseService,
    private readonly jwt: SupabaseJwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verify a Cloudflare Turnstile token server-side.
   * - Secret not configured → skip (fail-open) so dev/unconfigured envs still work.
   * - Secret set + token missing or invalid → reject.
   * - Network error reaching Cloudflare → fail-open (a provider outage shouldn't block all signups).
   */
  private async verifyTurnstile(token: string | undefined): Promise<void> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      this.logger.warn(
        'TURNSTILE_SECRET_KEY not set — skipping captcha verification (fail-open)',
      );
      return;
    }
    if (!token) {
      throw new BadRequestException('Captcha verification required. Please try again.');
    }
    try {
      const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret, response: token }),
        },
      );
      const data = (await res.json()) as { success?: boolean };
      if (!data.success) {
        throw new BadRequestException('Captcha verification failed. Please try again.');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Turnstile verify request failed, allowing signup (fail-open): ${msg}`);
    }
  }

  // ── /auth/firebase/exchange ──────────────────────────────────────────────

  /**
   * Exchange a Firebase ID token for a Supabase-compatible bridge session.
   *
   * JIT resolve order: by auth_uid → by email (link) → create new profile.
   */
  async exchangeFirebaseToken(idToken: string): Promise<BridgeSession> {
    const decoded = await this.verifyFirebaseToken(idToken);

    const authUid = decoded.uid;
    const email = decoded.email?.toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'Firebase ID token must include an email claim',
      );
    }

    const claimedName =
      typeof decoded.name === 'string' && decoded.name.length > 0
        ? decoded.name
        : null;

    // decoded.email_verified is NOT used as the application gate here.
    // It is passed to resolveProfile() only for:
    //   1. JIT-link security (prevents account takeover via unverified email claim)
    //   2. Setting is_email_verified on new profile rows (Google = always true)
    // The application gate is profiles.is_email_verified — checked after resolve.
    const profile = await this.resolveProfile(
      authUid,
      email,
      claimedName,
      decoded.email_verified === true,
    );

    // DB column is the application gate — debuggable via SQL, vendor-independent.
    if (!profile.is_email_verified) {
      this.logger.warn(
        `[DB gate] Sign-in rejected: is_email_verified=false for profile=${profile.id} email=${email}`,
      );
      throw new UnauthorizedException(
        'Email not verified. Check your inbox for the verification link.',
      );
    }

    return this.buildSession(profile, true);
  }

  // ── /auth/refresh ────────────────────────────────────────────────────────

  /**
   * Refresh the bridge Supabase JWT using a fresh Firebase ID token.
   *
   * Option A (no auth_refresh_tokens table): the Firebase ID token itself is
   * the refresh proof. Firebase SDK rotates it silently every ~hour;
   * onIdTokenChanged fires on the client and POSTs the new token here.
   * We verify it and sign a new Supabase JWT — no server-side session state.
   */
  async refresh(idToken: string): Promise<BridgeSession> {
    const decoded = await this.verifyFirebaseToken(idToken);
    // No Firebase email_verified check — DB field is the gate.

    const profile = await this.supabase.findProfileByAuthUid(decoded.uid);
    if (!profile) {
      throw new UnauthorizedException(
        'Profile not found. Sign in via /auth/firebase/exchange first.',
      );
    }

    if (!profile.is_email_verified) {
      throw new UnauthorizedException('Email not verified.');
    }

    return this.buildSession(profile);
  }

  // ── /auth/email/signup ───────────────────────────────────────────────────

  /**
   * Firebase-only email/password signup for new users (post-Phase 2).
   *
   * Creates the Firebase Auth user AND the Supabase profile row (is_email_verified=false)
   * in one signup call. Having the profile row immediately means:
   *   - verifyEmail() can always call setEmailVerified() — no "profile not found" edge case
   *   - exchangeFirebaseToken() finds the user on the fast path (findProfileByAuthUid) on first sign-in
   *   - The 100pt welcome bonus is awarded via award_signup_bonus_for_verified() when the user
   *     clicks the verification link (not at INSERT, since is_email_verified starts false and the
   *     trigger is gated on that column).
   */
  async emailSignup(input: {
    email: string;
    password: string;
    full_name: string;
    username?: string;
    chapter_id?: string;
    school_or_company?: string;
    captchaToken?: string;
  }): Promise<{ message: string }> {
    // Bot gate first — reject before any Firebase/DB work.
    await this.verifyTurnstile(input.captchaToken);

    const email = input.email.toLowerCase();

    const existing = await this.supabase.findProfileByEmail(email);
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Try signing in.',
      );
    }

    let createdUid: string;
    try {
      const created = await this.firebase.auth.createUser({
        email,
        password: input.password,
        displayName: input.full_name,
        emailVerified: false,
      });
      createdUid = created.uid;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        throw new ConflictException(
          'An account with this email already exists. Try signing in.',
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Firebase createUser failed for ${email}: ${msg}`);
      throw new InternalServerErrorException('Account creation failed');
    }

    // Create the profile row immediately with is_email_verified=false.
    // The modified trg_award_signup_bonus skips the bonus when is_email_verified=false;
    // award_signup_bonus_for_verified() handles it after email confirmation.
    try {
      await this.supabase.createProfileWithBonus({
        id: randomUUID(),
        email,
        full_name: input.full_name,
        auth_uid: createdUid,
        username: input.username ?? null,
        chapter_id: input.chapter_id ?? null,
        school_or_company: input.school_or_company ?? null,
        is_email_verified: false,
      });
    } catch (err) {
      // Non-fatal row creation failure — user can still verify email and sign in,
      // at which point resolveProfile() will create the row via createProfileWithBonus.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`createProfileWithBonus failed at signup for ${email}: ${msg}`);
    }

    // Generate a stateless verification JWT and send via Gmail SMTP.
    const verificationToken = this.signVerificationToken(createdUid, email);
    try {
      await this.email.sendVerificationEmail(email, verificationToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send verification email to ${email}: ${msg}`);
      // Non-fatal: account was created; user can request a resend.
    }

    return {
      message:
        'Account created. Check your email for a verification link before signing in.',
    };
  }

  // ── /auth/email/verify ───────────────────────────────────────────────────

  /**
   * Verifies a stateless email verification JWT (clicked from the verification email).
   * Marks the Firebase user as emailVerified and sets profiles.is_email_verified = true.
   * Returns the frontend URL to redirect to after verification.
   */
  async verifyEmail(token: string): Promise<string> {
    const appUrl = this.config.getOrThrow<string>('APP_URL');

    let payload: VerificationPayload;
    try {
      payload = jwt.verify(
        token,
        this.config.getOrThrow<string>('EMAIL_VERIFICATION_SECRET'),
      ) as VerificationPayload;
    } catch {
      return `${appUrl}/email-confirm?status=error&reason=expired`;
    }

    if (payload.purpose !== 'email_verify') {
      return `${appUrl}/email-confirm?status=error&reason=invalid`;
    }

    try {
      await this.firebase.auth.updateUser(payload.sub, { emailVerified: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Firebase updateUser failed for uid=${payload.sub}: ${msg}`);
      return `${appUrl}/email-confirm?status=error&reason=expired`;
    }

    try {
      const profile = await this.supabase.findProfileByEmail(payload.email);
      if (profile) {
        await this.supabase.setEmailVerified(profile.id);
      }
    } catch (err) {
      // Non-fatal — Firebase is updated; profile will sync on next sign-in.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`setEmailVerified failed for ${payload.email}: ${msg}`);
    }

    this.logger.log(`Email verified for ${payload.email} (uid=${payload.sub})`);
    return `${appUrl}/email-confirm?status=success`;
  }

  // ── /auth/email/resend-verification ─────────────────────────────────────

  /**
   * Resends a verification email. Always returns 200 regardless of whether
   * the email exists or is already verified (prevents account enumeration).
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    const normalised = email.toLowerCase();
    const silentOk = {
      message:
        'If that email exists and is unverified, a new link has been sent.',
    };

    let firebaseUser: { uid: string; emailVerified: boolean };
    try {
      firebaseUser = await this.firebase.auth.getUserByEmail(normalised);
    } catch {
      return silentOk; // user not found — don't reveal this
    }

    if (firebaseUser.emailVerified) {
      return silentOk; // already verified — don't reveal this
    }

    const token = this.signVerificationToken(firebaseUser.uid, normalised);
    try {
      await this.email.sendVerificationEmail(normalised, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Resend verification failed for ${normalised}: ${msg}`);
    }

    return silentOk;
  }

  // ── /auth/email/signin ───────────────────────────────────────────────────

  /**
   * Email/password sign-in with Phase 3 JIT legacy fallback.
   *
   * Flow:
   *   1. Check if Firebase user exists (Admin SDK — fast, cached).
   *   2. If yes → verify password via Firebase REST → exchange for bridge session.
   *   3. If no → legacy fallback: verify via Supabase Auth REST, create Firebase
   *      user, link auth_uid on existing profile, return bridge session.
   *      Next sign-in goes through Firebase directly (fallback never fires again).
   */
  async emailSignin(input: {
    email: string;
    password: string;
    firebaseWebApiKey: string;
  }): Promise<BridgeSession> {
    const email = input.email.toLowerCase();

    // Determine whether this user has already migrated to Firebase.
    let firebaseUserExists = false;
    try {
      await this.firebase.auth.getUserByEmail(email);
      firebaseUserExists = true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`getUserByEmail failed for ${email}: ${msg}`);
        throw new InternalServerErrorException('Sign-in failed');
      }
      // auth/user-not-found → proceed to legacy fallback
    }

    if (firebaseUserExists) {
      const idToken = await this.firebaseRestSignIn(
        email,
        input.password,
        input.firebaseWebApiKey,
      );
      return this.exchangeFirebaseToken(idToken);
    }

    return this.legacyEmailFallback(email, input.password);
  }

  /**
   * JIT legacy fallback for email/password users who exist in Supabase Auth
   * but have not yet been migrated to Firebase.
   *
   * On success: creates a Firebase user, links auth_uid on the profile, and
   * returns a bridge session. All subsequent sign-ins bypass this method.
   */
  private async legacyEmailFallback(
    email: string,
    password: string,
  ): Promise<BridgeSession> {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Verify credentials against Supabase Auth REST using service role key.
    // Server-to-server only — the service role key is never sent to the client.
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      this.logger.warn(`Legacy fallback: Supabase Auth rejected credentials for ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Credentials are correct — create Firebase user.
    // emailVerified: true because Supabase Auth required email confirmation
    // before allowing sign-in (email_confirmed_at must be set in auth.users).
    let firebaseUid: string;
    try {
      const fbUser = await this.firebase.auth.createUser({
        email,
        password,
        emailVerified: true,
      });
      firebaseUid = fbUser.uid;
      this.logger.log(
        `JIT-migrated legacy user to Firebase: email=${email}, uid=${firebaseUid}`,
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        // Race condition: concurrent request already created the Firebase user.
        const existing = await this.firebase.auth.getUserByEmail(email);
        firebaseUid = existing.uid;
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Firebase createUser failed for legacy user ${email}: ${msg}`,
        );
        throw new InternalServerErrorException('Sign-in failed');
      }
    }

    // Link the new Firebase UID to the existing profile row.
    const profile = await this.supabase.findProfileByEmail(email);
    if (!profile) {
      // Supabase Auth accepted credentials but no profile row exists — inconsistency.
      this.logger.error(
        `Legacy fallback: no profile found for ${email} after Supabase Auth success`,
      );
      throw new InternalServerErrorException('Account data not found');
    }

    const linked = await this.supabase.linkAuthUidToProfile(profile.id, firebaseUid);

    if (!linked.is_email_verified) {
      throw new UnauthorizedException('Email not verified.');
    }

    return this.buildSession(linked, true);
  }

  // ── /auth/email/reset ────────────────────────────────────────────────────

  /**
   * Sends a password-reset email.
   *
   * Routes to the Firebase reset flow for migrated users (auth_uid non-null)
   * or to Supabase Auth for legacy users who haven't JIT-migrated yet.
   * Always returns 200 regardless of whether the email exists (prevents
   * account enumeration).
   */
  async emailReset(
    email: string,
    supabaseUrl: string,
  ): Promise<{ message: string }> {
    const normalised = email.toLowerCase();
    const profile = await this.supabase.findProfileByEmail(normalised);

    if (profile?.auth_uid) {
      // Migrated user — Firebase sends the reset email.
      try {
        await this.firebase.auth.generatePasswordResetLink(normalised);
      } catch (err) {
        // Log but swallow — don't leak whether the account exists.
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Firebase password reset failed for ${normalised}: ${msg}`);
      }
    } else {
      // Legacy or unknown user — Supabase Auth handles the reset email.
      // Fire-and-forget; do not surface errors to the caller.
      void fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalised }),
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Supabase password reset failed for ${normalised}: ${msg}`);
      });
    }

    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  // ── /auth/account/delete ─────────────────────────────────────────────────

  /**
   * Deletes the caller's account: Firebase Auth user + Supabase profile cascade.
   *
   * The caller must supply a fresh Firebase ID token to confirm intent.
   * The Supabase RPC delete_own_account() handles the profile cascade
   * (reward_redemptions → point_transactions → event_registrations → profiles).
   * We do NOT delete from auth.users here — the Phase 4 migration removes
   * that line from the RPC; during the JIT window the RPC still deletes it.
   */
  async deleteAccount(idToken: string): Promise<{ message: string }> {
    const decoded = await this.verifyFirebaseToken(idToken);

    const profile = await this.supabase.findProfileByAuthUid(decoded.uid);
    if (!profile) {
      throw new UnauthorizedException('Profile not found');
    }

    // Cascade-delete via the existing Supabase RPC (service role bypasses RLS).
    const { error } = await this.supabase.raw.rpc('delete_own_account');
    if (error) {
      this.logger.error(
        `delete_own_account RPC failed for profile ${profile.id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Account deletion failed');
    }

    // Firebase Auth user deletion (non-fatal if it fails — profile is gone).
    try {
      await this.firebase.auth.deleteUser(decoded.uid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Firebase deleteUser failed for uid=${decoded.uid}: ${msg}`,
      );
    }

    return { message: 'Account deleted.' };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async verifyFirebaseToken(idToken: string) {
    try {
      return await this.firebase.verifyIdToken(idToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Firebase token verification failed: ${msg}`);
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  private async resolveProfile(
    authUid: string,
    email: string,
    fullName: string | null,
    emailVerified: boolean,
  ): Promise<Profile> {
    // 1. Already linked — fastest path, no verification check needed.
    const linked = await this.supabase.findProfileByAuthUid(authUid);
    if (linked) return linked;

    // 2. JIT-link by email. Firebase's email_verified is used HERE ONLY as
    //    ownership proof before linking auth_uid to an existing profile.
    //    Without this check an attacker who creates a Firebase account with
    //    victim@example.com (Firebase doesn't require verification upfront)
    //    could JIT-link to the victim's existing profile → account takeover.
    const byEmail = await this.supabase.findProfileByEmail(email);
    if (byEmail) {
      if (!emailVerified) {
        this.logger.warn(
          `JIT-link rejected: unverified email=${email} attempted to link to profile=${byEmail.id}`,
        );
        throw new UnauthorizedException(
          'Email verification required to link accounts.',
        );
      }
      this.logger.log(
        `JIT-linking auth_uid=${authUid} to existing profile id=${byEmail.id} (matched by email)`,
      );
      // Pass emailVerified so linkAuthUidToProfile also sets is_email_verified=true.
      // This backfills NULL values on pre-existing rows (column added after accounts
      // were created via Supabase Auth) so the is_email_verified DB gate passes.
      return this.supabase.linkAuthUidToProfile(byEmail.id, authUid, emailVerified);
    }

    // 3. New user — create profile.
    //    Pass emailVerified from the token:
    //    - Google OAuth: always true → profile created with is_email_verified=true
    //    - Email/password (unverified): false → profile created with is_email_verified=false
    //      exchangeFirebaseToken will then gate on the DB column and reject.
    this.logger.log(`Creating new profile for auth_uid=${authUid}, email=${email}`);

    let claimsName = fullName;
    let username: string | null = null;
    let chapterId: string | null = null;
    let schoolOrCompany: string | null = null;
    try {
      const fbUser = await this.firebase.auth.getUser(authUid);
      const claims = fbUser.customClaims ?? {};
      if (typeof claims['pending_full_name'] === 'string')
        claimsName = claims['pending_full_name'] as string;
      if (typeof claims['pending_username'] === 'string')
        username = claims['pending_username'] as string;
      if (typeof claims['pending_chapter_id'] === 'string')
        chapterId = claims['pending_chapter_id'] as string;
      if (typeof claims['pending_school_or_company'] === 'string')
        schoolOrCompany = claims['pending_school_or_company'] as string;
    } catch {
      // Non-fatal — create the profile with available data.
    }

    return this.supabase.createProfileWithBonus({
      id: randomUUID(),
      email,
      full_name: claimsName ?? email.split('@')[0],
      auth_uid: authUid,
      username,
      chapter_id: chapterId,
      school_or_company: schoolOrCompany,
      is_email_verified: emailVerified,
    });
  }

  private signVerificationToken(firebaseUid: string, email: string): string {
    return jwt.sign(
      { sub: firebaseUid, email, purpose: 'email_verify' },
      this.config.getOrThrow<string>('EMAIL_VERIFICATION_SECRET'),
      { expiresIn: '24h' },
    );
  }

  private async buildSession(profile: Profile, includeCustomToken = false): Promise<BridgeSession> {
    const accessToken = this.jwt.signBridgeJwt({
      sub: profile.id,
      email: profile.email,
    });

    let firebase_custom_token: string | undefined;
    if (includeCustomToken && profile.auth_uid) {
      try {
        firebase_custom_token = await this.firebase.auth.createCustomToken(profile.auth_uid);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`createCustomToken failed for profile ${profile.id}: ${msg}`);
      }
    }

    return {
      access_token: accessToken,
      refresh_token: randomUUID(),
      profile,
      ...(firebase_custom_token ? { firebase_custom_token } : {}),
    };
  }

  /**
   * Verifies email/password credentials via the Firebase Auth REST API and
   * returns a Firebase ID token. Used server-side so we can enforce
   * email_verified before issuing a bridge session.
   *
   * Phase 3 replaces this path for legacy (non-Firebase) users by falling back
   * to Supabase Auth REST before calling Firebase.
   */
  private async firebaseRestSignIn(
    email: string,
    password: string,
    apiKey: string,
  ): Promise<string> {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: { message?: string } };
      const code = body.error?.message ?? 'UNKNOWN';
      this.logger.warn(`Firebase REST sign-in failed for ${email}: ${code}`);

      if (
        code === 'EMAIL_NOT_FOUND' ||
        code === 'INVALID_PASSWORD' ||
        code === 'INVALID_LOGIN_CREDENTIALS'
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        throw new UnauthorizedException(
          'Too many sign-in attempts. Try again later.',
        );
      }
      throw new InternalServerErrorException('Sign-in failed');
    }

    const data = (await res.json()) as { idToken?: string };
    if (!data.idToken) {
      throw new InternalServerErrorException('No ID token in Firebase response');
    }
    return data.idToken;
  }
}
