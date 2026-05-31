/**
 * Gmail SMTP smoke test — run once to verify credentials and email template.
 * Usage (from server/):  npx ts-node scripts/test-smtp.ts [recipient@email.com]
 * If no recipient is given, sends to GMAIL_USER (self-send).
 */

import * as path from 'path';
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

// Load .env via dotenv (same parser @nestjs/config uses)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GMAIL_USER       = process.env['GMAIL_USER'];
const GMAIL_APP_PW     = process.env['GMAIL_APP_PASSWORD'];
const APP_URL          = process.env['APP_URL'] ?? 'http://localhost:5173';
const EMAIL_SECRET     = process.env['EMAIL_VERIFICATION_SECRET'];

if (!GMAIL_USER || !GMAIL_APP_PW) {
  console.error('\n✗ GMAIL_USER or GMAIL_APP_PASSWORD is empty in .env');
  process.exit(1);
}

if (!EMAIL_SECRET) {
  console.warn('⚠  EMAIL_VERIFICATION_SECRET not set — using placeholder token in test link');
}

const recipient = process.argv[2] ?? GMAIL_USER;

// ── Build a fake verification token for the email template ───────────────

const fakeToken = 'smtp-test-token-' + Date.now();
const verifyLink = `${APP_URL}/email-confirm?token=${fakeToken}`;

// ── Template (keep in sync with email.service.ts verificationTemplate) ───

function verificationTemplate(link: string): string {
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

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F5F9;visibility:hidden;">
    Confirm your email to unlock 500 Points+ and join 60,000+ geeks across 11 Philippine chapters.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
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

              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#EFF6FF;border-radius:14px;padding:13px 16px;
                              text-align:center;vertical-align:middle;">
                    <span style="font-size:28px;line-height:1;display:block;">✉️</span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0 0 14px;font-size:27px;font-weight:800;color:#0F172A;
                         line-height:1.2;letter-spacing:-0.4px;">
                Verify your email address
              </h1>

              <p style="margin:0 0 10px;font-size:15px;line-height:1.75;color:#334155;">
                Welcome to <strong style="color:#0F172A;">DEVCON+</strong> — you're one step away from
                joining 60,000+ geeks across 11 Philippine chapters.
              </p>
              <p style="margin:0 0 32px;font-size:15px;line-height:1.75;color:#334155;">
                Confirm your email to activate your account and unlock your first
                <strong style="color:#1152D4;">500 Points+</strong>.
              </p>

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

          <!-- STATS STRIP -->
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;
                        border-bottom:1px solid #E2E8F0;padding:22px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td align="center" width="33%" style="border-right:1px solid #E2E8F0;padding-right:12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;line-height:1;letter-spacing:-0.3px;">11</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.7px;">Chapters</p>
                  </td>
                  <td align="center" width="33%" style="border-right:1px solid #E2E8F0;padding:0 12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;line-height:1;letter-spacing:-0.3px;">60K+</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.7px;">Members</p>
                  </td>
                  <td align="center" width="33%" style="padding-left:12px;">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1152D4;line-height:1;letter-spacing:-0.3px;">14K+</p>
                    <p style="margin:5px 0 0;font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.7px;">Attendees / yr</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FALLBACK LINK -->
          <tr>
            <td style="background:#ffffff;padding:24px 40px 28px;">
              <p style="margin:0 0 6px;font-size:12px;color:#94A3B8;line-height:1.6;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin:0;">
                <a href="${link}" style="font-size:12px;color:#1152D4;word-break:break-all;text-decoration:none;">${link}</a>
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#1152D4;border-radius:0 0 20px 20px;padding:22px 40px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.65);text-align:center;line-height:1.9;">
                <strong style="color:rgba(255,255,255,0.90);font-weight:700;">DEVCON Philippines</strong>
                &nbsp;&middot;&nbsp; Sync. Support. Succeed.<br/>
                <span style="font-size:11px;">You're receiving this because you signed up at devconplus.ph</span>
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

// ── Run ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── DEVCON+ Gmail SMTP smoke test ──────────────────────');
  console.log(`  Sender:    ${GMAIL_USER}`);
  console.log(`  Recipient: ${recipient}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PW },
  });

  // Step 1: verify credentials without sending
  console.log('\n[1/2] Verifying credentials with Gmail...');
  try {
    await transporter.verify();
    console.log('  ✓ SMTP connection OK');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Connection failed: ${msg}`);
    console.error('\nCommon causes:');
    console.error('  • GMAIL_APP_PASSWORD is wrong (must be 16-char App Password, not account password)');
    console.error('  • 2-Step Verification is not enabled on the Google account');
    console.error('  • "Less secure app access" may be required if App Passwords are unavailable');
    process.exit(1);
  }

  // Step 2: send the actual test email
  console.log(`\n[2/2] Sending test verification email to ${recipient}...`);
  try {
    const info = await transporter.sendMail({
      from:    `DEVCON+ <${GMAIL_USER}>`,
      to:      recipient,
      subject: '[SMTP TEST] Verify your email — DEVCON+ is waiting for you',
      html:    verificationTemplate(verifyLink),
    });
    console.log(`  ✓ Sent  messageId=${info.messageId}`);
    console.log(`  ✓ Response: ${info.response}`);
    console.log('\n  Check your inbox — the email should arrive within 30 seconds.');
    console.log('  Note: the verification link in the email is a dummy (smtp-test-token) and will not work.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Send failed: ${msg}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
