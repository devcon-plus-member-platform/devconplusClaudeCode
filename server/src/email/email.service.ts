import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: nodemailer.Transporter;
  private fromAddress!: string;
  private serverUrl!: string;
  private appUrl!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const user = this.config.getOrThrow<string>('GMAIL_USER');
    const pass = this.config.getOrThrow<string>('GMAIL_APP_PASSWORD');
    // SERVER_URL: the NestJS server's own public URL. The verification link
    // must hit the backend first so it can verify the JWT and update Firebase +
    // Supabase before redirecting the browser to the frontend with ?status=success.
    this.serverUrl = this.config.getOrThrow<string>('SERVER_URL');
    this.appUrl = this.config.getOrThrow<string>('APP_URL');
    this.fromAddress = `DEVCON+ <${user}>`;

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    this.logger.log(`Email service initialized (sender: ${user})`);
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    // Link goes to the BACKEND (/auth/email/verify), not the frontend.
    // The backend verifies the JWT, marks Firebase + DB as verified, then
    // redirects the browser to APP_URL/email-confirm?status=success.
    const link = `${this.serverUrl}/auth/email/verify?token=${encodeURIComponent(token)}`;
    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Verify your email — DEVCON+ is waiting for you',
      html: this.verificationTemplate(link),
    });
    this.logger.log(`Verification email sent to ${to}`);
  }

  async sendOfficerInvitationEmail(to: string, chapterName: string): Promise<void> {
    const signUpLink = `${this.appUrl}/sign-up`;
    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: `You're invited to join DEVCON+ as a Chapter Officer`,
      html: this.officerInvitationTemplate(chapterName, signUpLink),
    });
    this.logger.log(`Officer invitation email sent to ${to} (chapter: ${chapterName})`);
  }

  private officerInvitationTemplate(chapterName: string, signUpLink: string): string {
    return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>You're invited to join DEVCON+</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F5F9;visibility:hidden;">
    You've been designated as a Chapter Officer for the ${chapterName} chapter of DEVCON+.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
    <tr>
      <td align="center" style="background:#F1F5F9;padding:40px 16px 56px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
               style="max-width:600px;width:100%;border-radius:20px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(17,82,212,0.12),0 1px 4px rgba(0,0,0,0.06);">

          <!-- HEADER -->
          <tr>
            <td style="background:#1152D4;padding:32px 40px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td>
                    <span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1;color:#ffffff;">
                      DEVCON<span style="color:#F8C630;">+</span>
                    </span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.55);letter-spacing:0.3px;">devcon.ph</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tagline strip -->
          <tr>
            <td style="background:#1152D4;padding:10px 40px 28px;">
              <span style="font-size:12px;font-weight:500;letter-spacing:1.2px;text-transform:uppercase;
                           color:rgba(255,255,255,0.55);">
                Sync &nbsp;&bull;&nbsp; Support &nbsp;&bull;&nbsp; Succeed
              </span>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;">

              <!-- Icon badge -->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#EFF6FF;border-radius:14px;padding:13px 16px;
                              text-align:center;vertical-align:middle;">
                    <span style="font-size:28px;line-height:1;display:block;">🎖️</span>
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin:0 0 8px;font-size:27px;font-weight:800;color:#0F172A;
                         line-height:1.2;letter-spacing:-0.4px;">
                You're invited to join DEVCON+
              </h1>
              <p style="margin:0 0 22px;font-size:17px;font-weight:700;color:#1152D4;">
                as a Chapter Officer — ${chapterName}
              </p>

              <!-- Info notice card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">
                      <strong>Were you expecting this invite?</strong><br/>
                      This invitation was sent by a DEVCON+ administrator. If you don't recognise this,
                      you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Body copy -->
              <p style="margin:0 0 10px;font-size:15px;line-height:1.75;color:#334155;">
                You have been designated as a <strong style="color:#0F172A;">Chapter Officer</strong> for the
                <strong style="color:#1152D4;">${chapterName}</strong> chapter of DEVCON Philippines.
              </p>
              <p style="margin:0 0 32px;font-size:15px;line-height:1.75;color:#334155;">
                Accept this invitation to unlock officer tools — create events, approve registrations,
                check in members, and manage your chapter community.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:20px;">
                <tr>
                  <td style="border-radius:12px;background:#1152D4;">
                    <a href="${signUpLink}" target="_blank"
                       style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;
                              font-weight:700;text-decoration:none;letter-spacing:0.1px;border-radius:12px;">
                      Accept Invitation &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Already a member note -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">
                      <strong>Already a DEVCON+ member?</strong> Your officer role has been applied automatically —
                      just <a href="${signUpLink.replace('/sign-up', '/sign-in')}" style="color:#1152D4;text-decoration:none;font-weight:600;">sign in</a>
                      to access your organizer dashboard.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- STATS STRIP -->
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;
                        border-bottom:1px solid #E2E8F0;padding:22px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td align="center" width="33%" style="border-right:1px solid #E2E8F0;padding-right:12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;
                               line-height:1;letter-spacing:-0.3px;">11</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;
                               text-transform:uppercase;letter-spacing:0.7px;">Chapters</p>
                  </td>
                  <td align="center" width="33%" style="border-right:1px solid #E2E8F0;padding:0 12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;
                               line-height:1;letter-spacing:-0.3px;">60K+</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;
                               text-transform:uppercase;letter-spacing:0.7px;">Members</p>
                  </td>
                  <td align="center" width="33%" style="padding-left:12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;
                               line-height:1;letter-spacing:-0.3px;">14K+</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;
                               text-transform:uppercase;letter-spacing:0.7px;">Attendees / yr</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#1152D4;border-radius:0 0 20px 20px;padding:22px 40px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.65);
                         text-align:center;line-height:1.9;">
                <strong style="color:rgba(255,255,255,0.90);font-weight:700;">DEVCON Philippines</strong>
                &nbsp;&middot;&nbsp; Sync. Support. Succeed.<br/>
                <span style="font-size:11px;">
                  You're receiving this because you were designated as a chapter officer by a DEVCON+ administrator.
                </span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
  }

  private verificationTemplate(link: string): string {
    return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Verify your DEVCON+ email</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!--
    Preheader — invisible text that appears in the inbox preview line
    before the email is opened. Pad with zero-width spaces to prevent
    the email client from pulling in body copy after it.
  -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F5F9;visibility:hidden;">
    Confirm your email to unlock 500 Points+ and join 60,000+ geeks across 11 Philippine chapters.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
    <tr>
      <td align="center" style="background:#F1F5F9;padding:40px 16px 56px;">

        <!-- Email card — 600 px wide, rounded, shadow -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
               style="max-width:600px;width:100%;border-radius:20px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(17,82,212,0.12),0 1px 4px rgba(0,0,0,0.06);">

          <!-- ══════════ HEADER ══════════════════════════════════════ -->
          <tr>
            <td style="background:#1152D4;padding:32px 40px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td>
                    <!-- Wordmark: white DEVCON + gold + to mirror the app -->
                    <span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1;color:#ffffff;">
                      DEVCON<span style="color:#F8C630;">+</span>
                    </span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.55);letter-spacing:0.3px;">devcon.ph</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tagline strip (still inside the blue header) -->
          <tr>
            <td style="background:#1152D4;padding:10px 40px 28px;">
              <span style="font-size:12px;font-weight:500;letter-spacing:1.2px;text-transform:uppercase;
                           color:rgba(255,255,255,0.55);">
                Sync &nbsp;&bull;&nbsp; Support &nbsp;&bull;&nbsp; Succeed
              </span>
            </td>
          </tr>

          <!-- ══════════ BODY ════════════════════════════════════════ -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;">

              <!-- Icon badge -->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#EFF6FF;border-radius:14px;padding:13px 16px;
                              text-align:center;vertical-align:middle;">
                    <span style="font-size:28px;line-height:1;display:block;">✉️</span>
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin:0 0 14px;font-size:27px;font-weight:800;color:#0F172A;
                         line-height:1.2;letter-spacing:-0.4px;">
                Verify your email address
              </h1>

              <!-- Body copy -->
              <p style="margin:0 0 10px;font-size:15px;line-height:1.75;color:#334155;">
                Welcome to <strong style="color:#0F172A;">DEVCON+</strong> — you're one step away from
                joining 60,000+ geeks across 11 Philippine chapters.
              </p>
              <p style="margin:0 0 32px;font-size:15px;line-height:1.75;color:#334155;">
                Confirm your email to activate your account and unlock your first
                <strong style="color:#1152D4;">500 Points+</strong>.
              </p>

              <!-- ── CTA Button ──────────────────────────────────── -->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:24px;">
                <tr>
                  <td style="border-radius:12px;background:#1152D4;">
                    <a href="${link}" target="_blank"
                       style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;
                              font-weight:700;text-decoration:none;letter-spacing:0.1px;border-radius:12px;">
                      Verify my email address &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">
                      ⏱&nbsp; This link expires in <strong>24 hours</strong>.
                      Didn't sign up for DEVCON+? You can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ══════════ STATS STRIP ═════════════════════════════════ -->
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;
                        border-bottom:1px solid #E2E8F0;padding:22px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td align="center" width="33%" style="border-right:1px solid #E2E8F0;padding-right:12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;
                               line-height:1;letter-spacing:-0.3px;">11</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;
                               text-transform:uppercase;letter-spacing:0.7px;">Chapters</p>
                  </td>
                  <td align="center" width="33%" style="border-right:1px solid #E2E8F0;padding:0 12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;
                               line-height:1;letter-spacing:-0.3px;">60K+</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;
                               text-transform:uppercase;letter-spacing:0.7px;">Members</p>
                  </td>
                  <td align="center" width="33%" style="padding-left:12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;
                               line-height:1;letter-spacing:-0.3px;">14K+</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;
                               text-transform:uppercase;letter-spacing:0.7px;">Attendees / yr</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════ FALLBACK LINK ═══════════════════════════════ -->
          <tr>
            <td style="background:#ffffff;padding:24px 40px 28px;">
              <p style="margin:0 0 6px;font-size:12px;color:#94A3B8;line-height:1.6;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin:0;">
                <a href="${link}" style="font-size:12px;color:#1152D4;
                                         word-break:break-all;text-decoration:none;">${link}</a>
              </p>
            </td>
          </tr>

          <!-- ══════════ FOOTER ══════════════════════════════════════ -->
          <tr>
            <td style="background:#1152D4;border-radius:0 0 20px 20px;padding:22px 40px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.65);
                         text-align:center;line-height:1.9;">
                <strong style="color:rgba(255,255,255,0.90);font-weight:700;">DEVCON Philippines</strong>
                &nbsp;&middot;&nbsp; Sync. Support. Succeed.<br/>
                <span style="font-size:11px;">
                  You're receiving this because you signed up at devconplus.ph
                </span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
  }
}
