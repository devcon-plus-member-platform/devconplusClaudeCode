import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Hosted brand assets (header logo + footer thumbnail). Served from Supabase
// public storage so they render without inline attachments. MUST be raster
// (PNG/JPG) — Gmail, Outlook and most clients do not render SVG in email.
const DEVCON_LOGO_URL =
  'https://rrztmvoknmyrpuffutvh.supabase.co/storage/v1/object/public/logo/logo.png';
const DEVCON_THUMB_URL =
  'https://rrztmvoknmyrpuffutvh.supabase.co/storage/v1/object/public/logo/thumbnail.png';
// Gradient header/footer with a solid fallback first (Outlook ignores gradients).
const DEVCON_BRAND_BG =
  'background:#1152D4;background:linear-gradient(135deg,#1152D4 0%,#2563EB 100%);';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: nodemailer.Transporter;
  private fromAddress!: string;
  private serverUrl!: string;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const user = this.config.get<string>('GMAIL_USER');
    const pass = this.config.get<string>('GMAIL_APP_PASSWORD');
    // SERVER_URL: the NestJS server's own public URL. The verification link
    // must hit the backend first so it can verify the JWT and update Firebase +
    // Supabase before redirecting the browser to the frontend with ?status=success.
    this.serverUrl = this.config.getOrThrow<string>('SERVER_URL');

    // GMAIL_USER / GMAIL_APP_PASSWORD are optional. When either is unset the
    // service runs in disabled mode: the app boots normally (Google sign-in
    // works) and only email sending is unavailable.
    if (!user || !pass) {
      this.logger.warn(
        'Email service disabled — GMAIL_USER / GMAIL_APP_PASSWORD not set. ' +
          'Verification emails will not be sent; email sign-up is unavailable.',
      );
      return;
    }

    this.fromAddress = `DEVCON+ <${user}>`;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    this.enabled = true;

    this.logger.log(`Email service initialized (sender: ${user})`);
  }

  // Escapes the small set of HTML-significant characters so caller-supplied
  // values (inviter name, chapter name) can't break the email markup.
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        `Email service disabled — cannot send verification email to ${to}`,
      );
      throw new ServiceUnavailableException(
        'Email service is not configured. Please use Google sign-in or contact support.',
      );
    }
    // Link goes to the BACKEND (/auth/email/verify), not the frontend.
    // The backend verifies the JWT, marks Firebase + DB as verified, then
    // redirects the browser to APP_URL/email-confirm?status=success.
    const link = `${this.serverUrl}/auth/email/verify?token=${encodeURIComponent(token)}`;
    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      // Plain, transactional subject — promotional/urgency phrasing
      // ("…is waiting for you") raises spam scores on a verification email.
      subject: 'Verify your DEVCON+ email address',
      // Always send a text/plain alternative alongside the HTML. An HTML-only
      // message (no multipart/alternative) is a well-known spam-score signal.
      text: this.verificationText(link),
      html: this.verificationTemplate(link),
    });
    this.logger.log(`Verification email sent to ${to}`);
  }

  // Plain-text counterpart to verificationTemplate(). Kept intentionally plain
  // and transactional (no marketing copy) so the multipart/alternative message
  // reads as a genuine verification email to spam filters.
  private verificationText(link: string): string {
    return [
      'Verify your DEVCON+ email address',
      '',
      'Welcome to DEVCON+. Confirm your email address to activate your account.',
      '',
      'Open this link to verify (it expires in 24 hours):',
      link,
      '',
      "If you didn't sign up for DEVCON+, you can safely ignore this email.",
      '',
      'DEVCON Philippines — Sync. Support. Succeed.',
    ].join('\n');
  }

  // ── Shared email shell + building blocks ───────────────────────────────────
  // One responsive 560px card: gradient header (logo + title + subtitle),
  // white body, gradient footer. Every email reuses this so branding stays
  // consistent across verification, invites, and notifications.

  private emailShell(opts: {
    title: string;
    subtitle: string;
    preheader: string;
    body: string;
  }): string {
    const { title, subtitle, preheader, body } = opts;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#EEF2FF;font-family:Arial,Helvetica,sans-serif;">

  <!-- Preheader — inbox preview line; padded with zero-width chars so the
       client doesn't pull body copy in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEF2FF;visibility:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;background:#EEF2FF;">
    <tr>
      <td align="center">

        <!-- MAIN CARD -->
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="width:100%;max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.08);">

          <!-- HEADER -->
          <tr>
            <td align="center" style="${DEVCON_BRAND_BG}padding:48px 32px 40px 32px;">
              <img src="${DEVCON_LOGO_URL}" width="160" alt="DEVCON+" style="display:block;width:160px;height:auto;margin:0 auto 24px auto;" />
              <h1 style="margin:0;font-size:32px;line-height:1.2;color:#FFFFFF;font-weight:700;">${title}</h1>
              <p style="margin:16px auto 0 auto;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.88);max-width:400px;">${subtitle}</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px 36px;">
${body}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="${DEVCON_BRAND_BG}padding:36px 24px;">
              <img src="${DEVCON_THUMB_URL}" width="56" alt="DEVCON+" style="display:block;margin:0 auto 18px auto;" />
              <p style="margin:0 0 10px 0;font-size:14px;color:#FFFFFF;font-weight:600;letter-spacing:0.3px;">DEVCON Philippines</p>
              <p style="margin:0 auto;font-size:12px;color:rgba(255,255,255,0.82);line-height:1.7;max-width:320px;">Building the future of Filipino developers through technology, innovation, and community.</p>
              <div style="width:60px;height:1px;background:rgba(255,255,255,0.25);margin:24px auto;"></div>
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.65);line-height:1.6;">© 2026 DEVCON+ Philippines. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
  }

  private emailButton(href: string, label: string): string {
    return `<table cellpadding="0" cellspacing="0" align="center" role="presentation" style="margin:0 auto 32px auto;">
                <tr>
                  <td align="center" bgcolor="#1152D4" style="border-radius:12px;box-shadow:0 4px 14px rgba(17,82,212,0.25);">
                    <a href="${href}" target="_blank" style="display:inline-block;padding:16px 32px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;border-radius:12px;">${label}</a>
                  </td>
                </tr>
              </table>`;
  }

  private emailAltLink(href: string): string {
    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0 0 10px 0;font-size:12px;color:#64748B;line-height:1.6;">If the button does not work, copy and paste this link into your browser:</p>
                    <p style="margin:0;font-size:12px;line-height:1.7;word-break:break-all;"><a href="${href}" style="color:#2563EB;text-decoration:none;">${href}</a></p>
                  </td>
                </tr>
              </table>`;
  }

  private verificationTemplate(link: string): string {
    const body = `              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.8;color:#334155;">Welcome to DEVCON+ 👋</p>
              <p style="margin:0 0 32px 0;font-size:15px;line-height:1.8;color:#475569;">To complete your registration, please verify your email address by clicking the button below. This link expires in <strong>24 hours</strong>.</p>
              ${this.emailButton(link, 'Confirm Email')}
              ${this.emailAltLink(link)}
              <p style="margin:28px 0 0 0;font-size:12px;line-height:1.7;color:#94A3B8;text-align:center;">If you did not create an account, you can safely ignore this email.</p>`;
    return this.emailShell({
      title: 'Verify your email',
      subtitle:
        'Confirm your email address to activate your DEVCON+ account and continue your experience.',
      preheader:
        'Confirm your email address to activate your DEVCON+ account.',
      body,
    });
  }

  // ── Officer invite email ───────────────────────────────────────────────────

  /**
   * Sends an invite email when an admin pre-assigns an email as a chapter officer.
   * Purely a notification + sign-up nudge — the officer role is granted automatically
   * by DB triggers on sign-up/verification (or immediately for existing accounts), so
   * there is no accept step. The CTA deep-links to the sign-up page with email pre-filled.
   */
  async sendOfficerInviteEmail(
    to: string,
    chapterName: string,
    inviterName: string,
    signUpLink: string,
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        `Email service disabled — cannot send officer invite to ${to}`,
      );
      throw new ServiceUnavailableException(
        'Email service is not configured. Please use Google sign-in or contact support.',
      );
    }
    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: "You're invited to be a DEVCON+ Chapter Officer",
      text: this.officerInviteText(chapterName, inviterName, signUpLink),
      html: this.officerInviteTemplate(chapterName, inviterName, signUpLink),
    });
    this.logger.log(`Officer invite sent to ${to}`);
  }

  private officerInviteText(
    chapterName: string,
    inviterName: string,
    signUpLink: string,
  ): string {
    return [
      "You're invited to be a DEVCON+ Chapter Officer",
      '',
      `${inviterName} has invited you to join the ${chapterName} chapter as a Chapter Officer.`,
      '',
      'Your officer role is ready — create your account (or sign in if you already have one) to access your officer tools:',
      signUpLink,
      '',
      "If you didn't expect this invitation, you can safely ignore this email.",
      '',
      'DEVCON Philippines — Sync. Support. Succeed.',
    ].join('\n');
  }

  private officerInviteTemplate(
    chapterName: string,
    inviterName: string,
    signUpLink: string,
  ): string {
    const safeChapter = this.escapeHtml(chapterName);
    const safeInviter = this.escapeHtml(inviterName);
    const body = `              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.8;color:#334155;">Hi there 👋</p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.8;color:#475569;"><strong style="color:#0F172A;">${safeInviter}</strong> has invited you to join the <strong style="color:#1152D4;">${safeChapter}</strong> chapter as a Chapter Officer.</p>
              <p style="margin:0 0 32px 0;font-size:15px;line-height:1.8;color:#475569;">Your officer role is ready. Create your account — or sign in if you already have one — to access your officer tools and start managing events.</p>
              ${this.emailButton(signUpLink, 'Join DEVCON+')}
              ${this.emailAltLink(signUpLink)}
              <p style="margin:28px 0 0 0;font-size:12px;line-height:1.7;color:#94A3B8;text-align:center;">Already have a DEVCON+ account? Just sign in — your officer access is applied automatically. If you didn't expect this invitation, you can safely ignore this email.</p>`;
    return this.emailShell({
      title: "You're invited",
      subtitle:
        'You have been invited to join DEVCON+ as a Chapter Officer.',
      preheader: `You've been invited to lead the ${safeChapter} chapter on DEVCON+.`,
      body,
    });
  }
}
