# Domain & Email Setup — Handover Note
> App: **DEVCON+ Beta** → https://devconplusbeta-v1.vercel.app (now 301-redirects to the live domain below)
> Target domain (as of this note): **plus-beta.devcon.ph**
> Transactional email: **no-reply-plus@devcon.ph** via Resend
> DNS provider: **Cloudflare** (manages devcon.ph)
> Last Updated: April 17, 2026
> Status: **BLOCKED — awaiting devcon.ph access**
>
> ✅ **RESOLVED — kept for historical context only.** The custom domain ultimately shipped as
> **`devcon.plus`** (production) / **`staging.devcon.plus`** (staging), not `plus-beta.devcon.ph` as
> planned here — see `.claude/CLAUDE.md` Section 1 header and Section 17 changelog. Transactional email
> is live end-to-end via the NestJS email module (nodemailer/Gmail) + the `send-email` Edge Function. Do
> not follow the steps below as current instructions; they describe a plan that was superseded.

---

## Handover Summary

Both the custom domain and the branded email setup are **fully designed and ready to execute**, but neither can proceed without DNS access to the `devcon.ph` zone in Cloudflare. The intern team does not have this access.

**Who needs to action this:** The DEVCON HQ IT officer (or whoever holds the Cloudflare account for `devcon.ph`).

**What is needed from them:**
1. Add one CNAME record in Cloudflare DNS (custom domain — 5 minutes)
2. Add four DNS records in Cloudflare DNS (email SMTP via Resend — 10 minutes)

The Vercel project, Supabase project, and Resend account setup can be prepared in parallel by the dev team without devcon.ph access. Only the DNS steps require HQ involvement.

---

## Blocked Items

| Task | Blocked By | Unblocked When |
|------|-----------|----------------|
| `plus-beta.devcon.ph` → Vercel | No Cloudflare access for devcon.ph | HQ IT adds CNAME record |
| `no-reply-plus@devcon.ph` SMTP | No Cloudflare access for devcon.ph | HQ IT adds SPF + DKIM + DMARC records |
| Google OAuth on new domain | Needs new domain live first | Domain step above complete |
| Supabase redirect URL update | Needs new domain live first | Domain step above complete |
| Edge Function CORS update | Needs new domain live first — but code change can be pre-staged | Domain step above complete |

---

## Part 1 — Custom Domain on Vercel (via Cloudflare DNS)

### Dev team — do this first (no DNS access required)

1. Go to Vercel Dashboard → select **devconplusbeta-v1** project
2. Navigate to **Settings → Domains**
3. Click **Add Domain** → enter `plus-beta.devcon.ph`
4. Vercel will show the required DNS record:
   ```
   Type:  CNAME
   Name:  plus-beta
   Value: cname.vercel-dns.com
   ```
5. Leave this screen open and hand the record values to HQ IT.

### HQ IT — add this record in Cloudflare

1. Log into [dash.cloudflare.com](https://dash.cloudflare.com) → select the **devcon.ph** zone
2. Go to **DNS → Records → Add record**

   | Field | Value |
   |-------|-------|
   | Type | `CNAME` |
   | Name | `plus-beta` |
   | Target | `cname.vercel-dns.com` |
   | Proxy status | **DNS only (grey cloud)** |
   | TTL | Auto |

   > **Critical:** Proxy must be **grey cloud (DNS only)**. If the orange proxy is on, Vercel cannot provision the SSL certificate and the domain will not work.

3. Click **Save**. Cloudflare propagates in under 5 minutes.

### Dev team — after HQ IT adds the record

1. Check Vercel → Settings → Domains — it will show **"Valid Configuration"**
2. Vercel auto-provisions a Let's Encrypt SSL cert — no manual step needed
3. Confirm at `https://plus-beta.devcon.ph` — should load the app with a green padlock

### Then update Supabase Auth Redirect URLs

1. Supabase Dashboard → **Authentication → URL Configuration**
2. Add to **Redirect URLs**: `https://plus-beta.devcon.ph/**`
3. Update **Site URL** if this becomes the primary production domain: `https://plus-beta.devcon.ph`

### Then update Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → the OAuth project used by DEVCON+
2. **APIs & Services → Credentials → OAuth 2.0 Client IDs** → open the DEVCON+ client
3. Under **Authorized redirect URIs**, add:
   ```
   https://plus-beta.devcon.ph/auth/v1/callback
   ```
4. Click **Save**

### Then update Edge Function CORS

**File:** `supabase/functions/_shared/cors.ts`

```ts
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://devconplus.vercel.app',
  'https://devconplusbeta-v1.vercel.app',
  'https://plus-beta.devcon.ph',  // ADD THIS
]
```

Redeploy all Edge Functions after this change:
```bash
supabase functions deploy generate-qr-token
supabase functions deploy award-points-on-scan
supabase functions deploy approve-at-door
supabase functions deploy check-rate-limit
```

---

## Part 2 — Transactional Email via Resend

Supabase sends auth emails from `noreply@mail.supabase.io` by default. This section replaces that with `no-reply-plus@devcon.ph`.

### Dev team — do this first (no DNS access required)

1. Go to [resend.com](https://resend.com) → sign up or log in with the team account
2. Navigate to **Domains → Add Domain** → enter `devcon.ph`
3. Resend will display a set of DNS records to add — copy all of them
4. Hand the exact record values (SPF, DKIM CNAMEs, DMARC) to HQ IT

### HQ IT — add these records in Cloudflare

In **Cloudflare DNS → Records**, add all records shown in Resend's Domains panel. Proxy must be **DNS only (grey cloud)** on every record — proxying breaks DKIM lookup.

**SPF record:**
```
Type:   TXT
Name:   @
Value:  v=spf1 include:amazonses.com ~all
Proxy:  DNS only
```
> Use the exact SPF value from Resend's dashboard — Resend uses Amazon SES infrastructure.

**DKIM records** (Resend provides 2–3 CNAMEs — add each separately):
```
Type:   CNAME
Name:   resend._domainkey   (exact name from Resend dashboard)
Target: <value from Resend dashboard>
Proxy:  DNS only
```

**DMARC record:**
```
Type:   TXT
Name:   _dmarc
Value:  v=DMARC1; p=none; rua=mailto:dmarc@devcon.ph
Proxy:  DNS only
```
> Start with `p=none` (monitor-only). After a few days of confirmed delivery, upgrade to `p=quarantine`, then `p=reject`.

### Dev team — after HQ IT adds the records

1. In Resend → Domains panel → click **Verify** → status should show **Active** (SPF + DKIM + DMARC all green)
2. Create a Resend API key: **API Keys → Create API Key**
   - Name: `devcon-plus-supabase`
   - Permission: **Sending access** only
   - Copy the key (starts with `re_`)
3. In Supabase Dashboard → **Authentication → SMTP Settings** → toggle **Enable Custom SMTP** ON

   | Field | Value |
   |-------|-------|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | _(the Resend API key, e.g. `re_xxxx`)_ |
   | Sender name | `DEVCON+` |
   | Sender email | `no-reply-plus@devcon.ph` |

4. Click **Save**
5. Send a test email via **Authentication → Email Templates → Send Test Email**
6. Confirm in **Resend Dashboard → Logs** that the message shows `delivered`

### Recommended — update email templates

In Supabase → **Authentication → Email Templates**:

- **Confirm signup** — mention DEVCON+, set link destination to `https://plus-beta.devcon.ph`
- **Reset password** — subject: `"Reset your DEVCON+ password"`
- **Magic link** — if used, update subject + body

Template variables: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`

---

## Verification Checklist

### Custom Domain
- [ ] `https://plus-beta.devcon.ph` loads the app in browser
- [ ] HTTPS padlock is green (SSL cert provisioned by Vercel)
- [ ] Cloudflare DNS record shows grey cloud (DNS only — not proxied)
- [ ] Google OAuth sign-in works end-to-end on new domain
- [ ] Password reset email link redirects to `https://plus-beta.devcon.ph/reset-password`
- [ ] Supabase auth redirect URLs include `https://plus-beta.devcon.ph/**`
- [ ] Edge Function CORS updated and functions redeployed

### Email SMTP
- [ ] Resend domain shows **Active** status (SPF + DKIM + DMARC all green)
- [ ] Test email arrives in inbox (not spam)
- [ ] Sender displays as `DEVCON+ <no-reply-plus@devcon.ph>`
- [ ] Resend Logs show `delivered` (not `bounced` or `complained`)
- [ ] Password reset and email confirmation flows work end-to-end

---

## Environment Variable Updates

After domain is live, update in Vercel project settings (**Settings → Environment Variables**):

```env
VITE_SITE_URL=https://plus-beta.devcon.ph
```

Keep `web/.env.local` pointing to localhost for local dev:
```env
VITE_SITE_URL=http://localhost:5173
```

---

## Troubleshooting

### Domain not verifying in Vercel
- Confirm the Cloudflare record is **DNS only** (grey cloud) — orange proxy blocks Vercel's cert provisioning
- Use `dig plus-beta.devcon.ph CNAME` or [dnschecker.org](https://dnschecker.org) to confirm the record is live
- If it's been >10 min, double-check the record name (`plus-beta`) and target (`cname.vercel-dns.com`)

### SSL certificate error after domain added
- Almost always caused by Cloudflare orange proxy — switch to grey cloud (DNS only)
- If still broken, remove and re-add the domain in Vercel to trigger a new cert issuance

### Google OAuth `redirect_uri_mismatch` error
- Verify the URI is saved in Google Cloud Console (takes a few minutes to propagate)
- Must match exactly: `https://plus-beta.devcon.ph/auth/v1/callback`
- Check Supabase → Authentication → Logs for the exact redirect URI being sent

### Emails going to spam
- All Resend DNS records in Cloudflare must have proxy **off** (DNS only) — proxying breaks DKIM lookup
- Check if the address is blocklisted: [mxtoolbox.com/blacklists](https://mxtoolbox.com/blacklists.aspx)
- Tighten DMARC from `p=none` to `p=quarantine` once SPF + DKIM are confirmed working

### Supabase SMTP test fails
- The SMTP **password** is the Resend API key (`re_...`), not the Resend account password
- Port 465 uses implicit SSL. If it fails, try port **587** with STARTTLS (Resend supports both)
- Check Resend → Logs for the specific error message

### CORS errors from Edge Functions on new domain
- Confirm `https://plus-beta.devcon.ph` is in `ALLOWED_ORIGINS` in the shared CORS config
- Redeploy all four Edge Functions after the change — Supabase does not hot-reload function code

---

## References

- [Vercel Custom Domains Docs](https://vercel.com/docs/projects/domains)
- [Cloudflare DNS Management](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
- [Resend SMTP Docs](https://resend.com/docs/send-with-smtp)
- [Resend + Supabase Integration Guide](https://resend.com/docs/send-with-supabase-smtp)
- [Supabase Custom SMTP Docs](https://supabase.com/docs/guides/auth/auth-smtp)
