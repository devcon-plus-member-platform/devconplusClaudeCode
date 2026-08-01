import React from 'react';

export interface MaintenanceShellProps {
  /** Human-readable return date/time shown in the "Back by" pill, e.g. "Monday, August 3, 2026". */
  backBy: string;
}

/**
 * Single source of truth for the DEVCON+ maintenance page markup.
 *
 * This renders a COMPLETE standalone HTML document (not a fragment meant to mount into
 * the member app). It intentionally has zero dependency on Tailwind, the design-system
 * tokens, or web/'s build pipeline — all styling is inline CSS in a <style> tag — because
 * this page must still render correctly even when the main app/build is the thing that's
 * broken. See ops/maintenance-site/README.md and docs/runbooks/maintenance-window.md.
 *
 * Do not import this into web/src — it is rendered to static HTML at build time via
 * scripts/generate.tsx and served as plain files (web/public/maintenance.html and
 * ops/maintenance-site/maintenance.html), never as a live React component.
 */
export function MaintenanceShell({ backBy }: MaintenanceShellProps): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex" />
        <meta name="color-scheme" content="light" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <title>DEVCON+ is getting an upgrade. We will be back soon!</title>
        {/* dangerouslySetInnerHTML avoids React HTML-escaping quotes inside the CSS text
            (<style> is a raw-text element — browsers don't decode entities in it, so an
            escaped {CSS} would corrupt the @font-face url()s and the SVG data-URI). CSS
            below is a fully static string, not user input, so this is safe. */}
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <div className="wrap">
          <div className="logo-row">
            <svg width="232" height="176" viewBox="0 0 232 176" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DEVCON+ logo">
              <path d="M0 60.6728V0H22.4438C43.5464 0 58.3897 12.5408 58.3897 30.2923C58.3897 48.0437 43.5464 60.6728 22.4438 60.6728H0ZM15.2904 46.9839H24.7687C35.2306 46.9839 42.7416 40.007 42.7416 30.2923C42.7416 20.5775 35.2306 13.6889 24.7687 13.6889H15.2904V46.9839Z" fill="white" />
              <path d="M116.505 13.5123H83.4202V22.9621H113.465V36.4744H83.4202V47.1606H116.505V60.6728H68.1298V0H116.505V13.5123Z" fill="white" />
              <path d="M174.888 0H192.056L167.735 60.6728H150.566L126.245 0H143.413L159.15 39.3005L174.888 0Z" fill="white" />
              <path d="M32.9951 128C15.1116 128 0 113.605 0 96.5596C0 79.5147 15.1116 65.2076 32.9951 65.2076C42.5628 65.2076 51.3257 69.2701 57.4061 75.6288L46.2289 85.4319C43.0099 81.4577 38.1813 78.8965 32.9951 78.8965C23.6062 78.8965 15.6481 87.0216 15.6481 96.5596C15.6481 106.186 23.6062 114.311 32.9951 114.311C38.2707 114.311 43.0099 111.75 46.3183 107.776L57.4061 117.49C51.3257 123.937 42.5628 128 32.9951 128Z" fill="white" />
              <path d="M123.25 84.1832C123.25 93.3294 115.831 100.744 106.679 100.744C97.5264 100.744 90.1071 93.3294 90.1071 84.1832C90.1071 75.037 97.5264 67.6226 106.679 67.6226C115.831 67.6226 123.25 75.037 123.25 84.1832Z" fill="#EA641D" />
              <path d="M98.3929 84.1832C98.3929 93.3294 90.9736 100.744 81.8214 100.744C72.6693 100.744 65.25 93.3294 65.25 84.1832C65.25 75.037 72.6693 67.6226 81.8214 67.6226C90.9736 67.6226 98.3929 75.037 98.3929 84.1832Z" fill="#E9C902" />
              <path d="M98.3929 109.024C98.3929 118.17 90.9736 125.585 81.8215 125.585C72.6693 125.585 65.25 118.17 65.25 109.024C65.25 99.8778 72.6693 92.4634 81.8215 92.4634C90.9736 92.4634 98.3929 99.8778 98.3929 109.024Z" fill="#5C29A1" />
              <path d="M123.25 109.024C123.25 118.17 115.831 125.585 106.679 125.585C97.5264 125.585 90.1071 118.17 90.1071 109.024C90.1071 99.8778 97.5264 92.4634 106.679 92.4634C115.831 92.4634 123.25 99.8778 123.25 109.024Z" fill="#73B209" />
              <path d="M123.25 84.1832C123.25 93.3294 115.831 100.744 106.679 100.744C97.5264 100.744 90.1071 93.3294 90.1071 84.1832C90.1071 75.037 97.5264 67.6226 106.679 67.6226C115.831 67.6226 123.25 75.037 123.25 84.1832Z" fill="#EA641D" />
              <path d="M94.2494 73.2311C96.8274 76.1504 98.3929 79.9837 98.3929 84.1832C98.3929 88.3828 96.8273 92.216 94.2494 95.1353C91.6718 92.2161 90.1071 88.3825 90.1071 84.1832C90.1072 79.984 91.6718 76.1503 94.2494 73.2311Z" fill="#E9C902" />
              <path d="M94.2494 73.2311C96.8274 76.1504 98.3929 79.9837 98.3929 84.1832C98.3929 88.3828 96.8273 92.216 94.2494 95.1353C91.6718 92.2161 90.1071 88.3825 90.1071 84.1832C90.1072 79.984 91.6718 76.1503 94.2494 73.2311Z" fill="#E9C902" />
              <path d="M130.5 125.88V65.2076H145.79L172.526 101.064V65.2076H187.817V125.88H172.526L145.79 90.0243V125.88H130.5Z" fill="white" />
              <path d="M227.383 60.5593C229.933 60.5593 232 62.6249 232 65.173C232 67.7211 229.933 69.7868 227.383 69.7868H220.079V77.1895C220.079 79.9087 217.873 82.1131 215.152 82.1131C212.431 82.1131 210.225 79.9087 210.225 77.1895V69.7868H202.783C200.234 69.7868 198.167 67.7211 198.167 65.173C198.167 62.6249 200.234 60.5593 202.783 60.5593H210.225V53.2254C210.225 50.5062 212.431 48.3018 215.152 48.3018C217.873 48.3018 220.079 50.5062 220.079 53.2254V60.5593H227.383Z" fill="white" />
              <rect y="136" width="94" height="40" rx="20" fill="#D65D1D" />
              <path d="M27.8584 163H19.7704V146.992H27.6424C30.5944 146.992 32.2024 148.816 32.2024 151.072C32.2024 153.064 30.9064 154.432 29.4184 154.744C31.1464 155.008 32.5144 156.712 32.5144 158.656C32.5144 161.152 30.8824 163 27.8584 163ZM27.0904 153.592C28.5064 153.592 29.3224 152.752 29.3224 151.528C29.3224 150.352 28.5064 149.464 27.0904 149.464H22.5784V153.592H27.0904ZM27.2104 160.528C28.7224 160.528 29.6344 159.688 29.6344 158.296C29.6344 157.096 28.7944 156.064 27.2104 156.064H22.5784V160.528H27.2104ZM46.3243 163H35.3563V146.992H46.3243V149.464H38.1643V153.592H46.1563V156.064H38.1643V160.528H46.3243V163ZM55.8319 163H53.0239V149.464H48.1759V146.992H60.6799V149.464H55.8319V163ZM75.9132 163H72.7212L71.5452 159.904H64.2012L63.0252 163H59.8332L66.1212 146.992H69.6252L75.9132 163ZM70.7532 157.432L67.8732 149.8L64.9932 157.432H70.7532Z" fill="white" />
            </svg>
          </div>

          <main className="card">
            <h1>DEVCON+ is getting an upgrade</h1>
            <p>
              We&rsquo;re making things faster and better for the community.
              We will be back online soon!
            </p>

            <div className="eta">
              <svg className="eta-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="#1152D4" strokeWidth="1.6" />
                <path d="M12 7V12L15.5 14" stroke="#1152D4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="eta-text">
                <span className="eta-label">Back by</span>
                <span className="eta-value">{backBy}</span>
              </span>
            </div>

            <hr />

            <p className="contact-label">Need us sooner?</p>
            <a className="contact-email" href="mailto:plusmemberplatform@devcon.ph">plusmemberplatform@devcon.ph</a>

            <div className="socials">
              <span className="social-pill">Facebook: DEVCON Philippines</span>
              <span className="social-pill">X / Twitter: @devconph</span>
              <span className="social-pill">Instagram: @devcon.ph</span>
            </div>
          </main>

          <p className="footer-note">DEVCON+ &middot; Sync. Support. Succeed.</p>
        </div>
      </body>
    </html>
  );
}

const CSS = `
  :root {
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  @font-face {
    font-family: 'Proxima Nova';
    src: url('/fonts/ProximaNova-Regular.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'Proxima Nova';
    src: url('/fonts/ProximaNova-Semibold.woff2') format('woff2');
    font-weight: 600;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'Proxima Nova';
    src: url('/fonts/ProximaNova-Bold.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'Proxima Nova';
    src: url('/fonts/ProximaNova-Black.woff2') format('woff2');
    font-weight: 900;
    font-style: normal;
    font-display: swap;
  }

  body {
    font-family: 'Proxima Nova', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #0F172A;
    background-color: #1152D4;
    background-image:
      url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='60'%20height='60'%3E%3Ccircle%20cx='0'%20cy='0'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='60'%20cy='0'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='0'%20cy='60'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='60'%20cy='60'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='30'%20cy='30'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3C/svg%3E"),
      radial-gradient(120% 90% at 15% -10%, #6099F4 0%, rgba(96, 153, 244, 0) 55%),
      linear-gradient(160deg, #1152D4 0%, #0D42AA 55%, #1E2A56 100%);
    background-size: 60px 60px, auto, auto;
    background-position: top center, 0 0, 0 0;
    background-repeat: repeat, no-repeat, no-repeat;
    background-attachment: fixed, fixed, fixed;
  }

  .wrap {
    width: 100%;
    max-width: 420px;
  }

  .logo-row {
    display: flex;
    justify-content: center;
    margin-bottom: 28px;
  }

  .logo-row svg {
    width: 116px;
    height: auto;
  }

  .card {
    background: #FFFFFF;
    border-radius: 28px;
    padding: 36px 28px 32px;
    box-shadow: 0 20px 60px rgba(14, 33, 87, 0.35);
    text-align: center;
  }

  h1 {
    font-size: 22px;
    line-height: 1.3;
    font-weight: 900;
    color: #0F172A;
    margin: 0 0 12px;
  }

  p {
    font-size: 14px;
    line-height: 1.6;
    color: #64748B;
    margin: 0 0 20px;
  }

  .eta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 20px;
    padding: 14px 16px;
    margin-bottom: 24px;
  }

  .eta-icon {
    flex: none;
    width: 22px;
    height: 22px;
  }

  .eta-text {
    text-align: left;
  }

  .eta-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94A3B8;
    margin-bottom: 2px;
  }

  .eta-value {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: #1152D4;
  }

  hr {
    border: none;
    border-top: 1px solid #E2E8F0;
    margin: 24px 0 20px;
  }

  .contact-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94A3B8;
    margin: 0 0 8px;
  }

  .contact-email {
    font-size: 14px;
    font-weight: 700;
    color: #1152D4;
    text-decoration: none;
    word-break: break-word;
  }

  .socials {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 18px;
    flex-wrap: wrap;
  }

  .social-pill {
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    border-radius: 999px;
    padding: 6px 12px;
  }

  .footer-note {
    margin-top: 22px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.75);
    text-align: center;
  }

  @media (min-width: 640px) {
    .card {
      padding: 44px 40px 40px;
    }

    h1 {
      font-size: 26px;
    }

    p {
      font-size: 15px;
    }
  }
`;
