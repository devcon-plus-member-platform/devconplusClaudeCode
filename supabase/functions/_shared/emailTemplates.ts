// Shared email HTML templates for DEVCON+ transactional emails.
// On-brand: gradient header/footer, hosted logo, rounded 560px card —
// matches the verification and officer-invite emails sent from the server.

export interface RegistrationEmailParams {
  memberName: string
  eventTitle: string
  eventDate: string      // pre-formatted date string
  eventLocation?: string
  pointsValue: number
  ticketUrl: string
}

// Hosted brand assets (header logo + footer thumbnail). MUST be raster
// (PNG/JPG) — Gmail, Outlook and most clients do not render SVG in email.
const LOGO_URL = 'https://rrztmvoknmyrpuffutvh.supabase.co/storage/v1/object/public/logo/logo.png'
const THUMB_URL = 'https://rrztmvoknmyrpuffutvh.supabase.co/storage/v1/object/public/logo/thumbnail.png'
// Gradient header/footer with a solid fallback first (Outlook ignores gradients).
const BRAND_BG = 'background:#1152D4;background:linear-gradient(135deg,#1152D4 0%,#2563EB 100%);'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shell(opts: { title: string; subtitle: string; preheader: string; body: string }): string {
  const { title, subtitle, preheader, body } = opts
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

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEF2FF;visibility:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;background:#EEF2FF;">
    <tr>
      <td align="center">

        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="width:100%;max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.08);">

          <tr>
            <td align="center" style="${BRAND_BG}padding:48px 32px 40px 32px;">
              <img src="${LOGO_URL}" width="160" alt="DEVCON+" style="display:block;width:160px;height:auto;margin:0 auto 24px auto;" />
              <h1 style="margin:0;font-size:32px;line-height:1.2;color:#FFFFFF;font-weight:700;">${title}</h1>
              <p style="margin:16px auto 0 auto;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.88);max-width:400px;">${subtitle}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 36px;">
${body}
            </td>
          </tr>

          <tr>
            <td align="center" style="${BRAND_BG}padding:36px 24px;">
              <img src="${THUMB_URL}" width="56" alt="DEVCON+" style="display:block;margin:0 auto 18px auto;" />
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
</html>`
}

function button(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" align="center" role="presentation" style="margin:0 auto 32px auto;">
                <tr>
                  <td align="center" bgcolor="#1152D4" style="border-radius:12px;box-shadow:0 4px 14px rgba(17,82,212,0.25);">
                    <a href="${href}" target="_blank" style="display:inline-block;padding:16px 32px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;border-radius:12px;">${label}</a>
                  </td>
                </tr>
              </table>`
}

function detailRow(label: string, value: string): string {
  return `<tr>
                    <td style="font-size:12px;color:#94A3B8;padding:8px 0;vertical-align:top;width:88px;">${label}</td>
                    <td style="font-size:13px;color:#0F172A;font-weight:600;padding:8px 0;">${value}</td>
                  </tr>`
}

function detailCard(p: RegistrationEmailParams): string {
  const rows = [
    detailRow('Event', esc(p.eventTitle)),
    detailRow('Date', esc(p.eventDate)),
    ...(p.eventLocation ? [detailRow('Location', esc(p.eventLocation))] : []),
    detailRow(
      'Points',
      `<span style="display:inline-block;background:#DCFCE7;color:#16A34A;font-weight:700;font-size:12px;padding:3px 10px;border-radius:99px;">+${p.pointsValue} XP on attendance</span>`,
    ),
  ].join('\n')
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin:0 0 28px 0;">
                <tr>
                  <td style="padding:8px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
${rows}
                    </table>
                  </td>
                </tr>
              </table>`
}

export function registrationConfirmationEmail(params: RegistrationEmailParams): string {
  const title = esc(params.eventTitle)
  const body = `              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.8;color:#334155;">Hi ${esc(params.memberName)} 👋</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.8;color:#475569;">Your spot has been confirmed for <strong style="color:#0F172A;">${title}</strong>. We can't wait to see you there!</p>
              ${detailCard(params)}
              ${button(params.ticketUrl, 'View My Ticket')}
              <p style="margin:28px 0 0 0;font-size:12px;line-height:1.7;color:#94A3B8;text-align:center;">Show your QR ticket at the venue entrance to check in and earn your points.</p>`
  return shell({
    title: "You're registered!",
    subtitle: "Your spot is confirmed — we can't wait to see you there.",
    preheader: `Your spot for ${title} is confirmed.`,
    body,
  })
}

export function registrationApprovedEmail(params: RegistrationEmailParams): string {
  const title = esc(params.eventTitle)
  const body = `              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.8;color:#334155;">Hi ${esc(params.memberName)} 👋</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.8;color:#475569;">Great news — your registration for <strong style="color:#0F172A;">${title}</strong> has been approved by the organizer.</p>
              ${detailCard(params)}
              ${button(params.ticketUrl, 'View My Ticket')}
              <p style="margin:28px 0 0 0;font-size:12px;line-height:1.7;color:#94A3B8;text-align:center;">Your QR ticket is ready. Show it at the venue entrance to check in.</p>`
  return shell({
    title: "You're approved!",
    subtitle: 'Your registration has been approved by the organizer.',
    preheader: `Your registration for ${title} has been approved.`,
    body,
  })
}
