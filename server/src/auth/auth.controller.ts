import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { EmailResetDto } from './dto/email-reset.dto';
import { EmailSigninDto } from './dto/email-signin.dto';
import { EmailSignupDto } from './dto/email-signup.dto';
import { FirebaseExchangeDto } from './dto/firebase-exchange.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { AuthGuard, AuthenticatedUser } from './auth.guard';
import { RateLimit } from '../common/throttler/rate-limit.decorator';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import { BridgeSession } from './types';

@Controller('auth')
export class AuthController {
  private readonly supabaseUrl: string;
  private readonly firebaseWebApiKey: string;

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {
    this.supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    this.firebaseWebApiKey = this.config.getOrThrow<string>('FIREBASE_WEB_API_KEY');
  }

  /**
   * POST /auth/firebase/exchange
   * Body: { id_token }
   *
   * Verifies the Firebase ID token, JIT-links or creates a profile,
   * and returns a Supabase-compatible bridge session.
   * Client passes the tokens to supabase.auth.setSession().
   */
  @Post('firebase/exchange')
  @HttpCode(HttpStatus.OK)
  exchange(@Body() body: FirebaseExchangeDto): Promise<BridgeSession> {
    return this.auth.exchangeFirebaseToken(body.id_token);
  }

  /**
   * POST /auth/refresh
   * Body: { id_token }  — a fresh Firebase ID token
   *
   * Re-signs the Supabase bridge JWT. Called by the client's onIdTokenChanged
   * listener (fires every ~hour when Firebase rotates the ID token) and by
   * the TOKEN_REFRESH_FAILED handler as a fallback.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshDto): Promise<BridgeSession> {
    return this.auth.refresh(body.id_token);
  }

  /**
   * POST /auth/email/signup
   * Body: { email, password, full_name, username?, chapter_id?, school_or_company? }
   *
   * Creates a Firebase Auth user and sends a verification email.
   * Profile is created on first successful sign-in (after email verification).
   */
  @Post('email/signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() body: EmailSignupDto): Promise<{ message: string }> {
    return this.auth.emailSignup({
      email: body.email,
      password: body.password,
      full_name: body.full_name,
      username: body.username,
      chapter_id: body.chapter_id,
      school_or_company: body.school_or_company,
      captchaToken: body.captchaToken,
    });
  }

  /**
   * POST /auth/email/signin
   * Body: { email, password }
   *
   * Firebase-only sign-in path. Verifies credentials via the Firebase REST
   * API (server-side, so we control the email_verified gate), then issues
   * a bridge session.
   *
   * Phase 3 will add a Supabase Auth fallback for legacy users whose profiles
   * have auth_uid IS NULL (i.e., they haven't JIT-migrated yet).
   */
  @Post('email/signin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('login')
  signin(@Body() body: EmailSigninDto): Promise<BridgeSession> {
    return this.auth.emailSignin({
      email: body.email,
      password: body.password,
      firebaseWebApiKey: this.firebaseWebApiKey,
    });
  }

  /**
   * POST /auth/email/reset
   * Body: { email }
   *
   * Sends a password-reset link. Routes to Firebase for migrated users
   * (auth_uid non-null), Supabase Auth for legacy users. Always returns 200
   * to prevent email enumeration.
   */
  @Post('email/reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('password_reset')
  reset(@Body() body: EmailResetDto): Promise<{ message: string }> {
    return this.auth.emailReset(body.email, this.supabaseUrl);
  }

  /**
   * GET /auth/email/verify?token=...
   *
   * Verifies the stateless JWT from the verification email. Sets Firebase
   * emailVerified=true and profiles.is_email_verified=true, then redirects
   * the browser to the frontend with ?status=success or ?status=error.
   * Uses @Redirect so clicking the email link lands on the app, not raw JSON.
   */
  @Get('email/verify')
  @Redirect()
  async verifyEmail(@Query('token') token: string): Promise<{ url: string }> {
    const url = await this.auth.verifyEmail(token ?? '');
    return { url };
  }

  /**
   * POST /auth/email/resend-verification
   * Body: { email }
   *
   * Resends the verification email. Always returns 200 regardless of whether
   * the address exists or is already verified (prevents account enumeration).
   */
  @Post('email/resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('send_email')
  resendVerification(
    @Body() body: ResendVerificationDto,
  ): Promise<{ message: string }> {
    return this.auth.resendVerification(body.email);
  }

  /**
   * DELETE /auth/account
   * Body: { id_token }
   *
   * Deletes the caller's account: Firebase Auth user + Supabase profile
   * cascade via the delete_own_account() RPC. Requires a fresh ID token
   * to confirm the deletion is intentional and from the account owner.
   * Protected by AuthGuard for role/existence verification.
   */
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  deleteAccount(
    @Body() body: DeleteAccountDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.auth.deleteAccount(body.id_token);
  }
}
