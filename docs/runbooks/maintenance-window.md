# Runbook: 2-Day Planned Maintenance Window

Operator checklist for taking DEVCON+ dark for a planned window and bringing it back up.

**Stack:**
- Frontend: Vercel SPA, production domain `devcon.plus` (project linked locally in `web/` — not in git, see `web/.gitignore`)
- Maintenance page: standalone Vercel project `ops/maintenance-site/` — serves real `HTTP 503` + `Retry-After` on every path (primary go-dark mechanism; see `ops/maintenance-site/README.md`)
- Backend: NestJS gateway on EC2 (`i-06518a219cae8a703`, `ap-southeast-1`) behind host nginx, `https://api.devcon.plus`
- DB: Supabase Postgres

**⚠️ Read before starting — two things that aren't obvious from the code:**

1. **`api.devcon.plus` is currently served by the *staging* deploy slot.** Per the comments in
   `.github/workflows/deploy-backend-production.yml`, the "production" slot (port 8010) is
   dormant — `master` has no `server/` yet. Live traffic on `api.devcon.plus` today comes from
   the **staging** container (port 8000), deployed by `deploy-backend-staging.yml` on every push
   to `dev`. Freeze that workflow, not the dormant production one.
2. **Any new Production deployment to the `web` Vercel project auto-re-aliases `devcon.plus`.**
   Vercel points every Production Domain on a project at the latest Production deployment
   automatically. If someone runs `vercel --prod` from `web/` (or a connected git push triggers
   one) while you're go-dark, it silently un-aliases the maintenance site. This is the main
   reason to freeze deploys before touching the alias, not just a courtesy.

---

## 1. Pre-flight (do the day before / hours before the window opens)

- [ ] **1.1 Announce the freeze.** No merges to `dev` (backend) or the `web` project's production
      branch until bring-up is confirmed (§3).
- [ ] **1.2 Disable the workflow that actually deploys `api.devcon.plus`:**
      `gh workflow disable "Deploy backend (staging)"`. Leave `deploy-backend-production.yml`
      alone — it's already a no-op.
- [ ] **1.3 Capture the current production frontend deployment** for rollback:
      `vercel ls --prod` (from `web/`, requires the project to already be `vercel link`ed
      locally) to list deployments, then `vercel inspect <url>` on the top one to confirm it's
      READY and note its URL. **Write this URL down outside of Vercel** (chat, doc) — it's
      the rollback target in §3.3 and §4.
- [ ] **1.4 Supabase checkpoint.** Note the exact UTC timestamp you're starting from (PITR
      restore target). Confirm in the Supabase dashboard (Database → Backups) that PITR is
      enabled and the retention window covers the maintenance duration. Additionally pull a
      portable `pg_dump` as an out-of-band artifact — PITR is a moving window, a dump is a fixed
      one:
      `pg_dump "$SUPABASE_DB_URL" -Fc -f devcon-plus-pre-maint-$(date +%Y%m%dT%H%M%SZ).dump`
- [ ] **1.5 EC2 EBS snapshot.** Single root volume (gp3, 8GB, encrypted) on the backend
      instance. Look up the volume ID, then snapshot it — see the copy-paste block (§5) for the
      exact commands.
- [ ] **1.6 Pause the keep-alive cron.** Vercel dashboard → `web` project → Settings → Cron
      Jobs → toggle off `/api/keep-alive`. (No CLI toggle exists; if the dashboard is
      unavailable, comment out the `crons` block in `web/vercel.json`, commit, deploy, and
      revert after bring-up — same pattern as the `maintenance.html` toggle in
      `maintenance-fallback.md`.)
- [ ] **1.7 Pause pg_cron jobs.** List what's actually scheduled first (don't assume — some of
      the jobs in the migrations ship inactive/commented and may not be live), then pause by
      name:
      ```sql
      SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
      SELECT cron.alter_job(jobid, active := false) FROM cron.job
        WHERE jobname IN ('purge-cron-run-history', 'rate-limit-log-cleanup',
                           'annual-points-reset', 'deactivate-expired-rewards');
      ```
- [ ] **1.8 Confirm the maintenance-site project is current.** `cd ops/maintenance-site &&
      vercel deploy --prod` (if the copy last changed) so you have a fresh, known-good
      deployment URL ready for §2.2.
- [ ] **1.9 Decide and record the hard-stop time** (§4) before you start.

## 2. Go-dark (start of window)

- [ ] **2.1** From `ops/maintenance-site/`, grab the deployment URL from step 1.8's output (or
      re-run `vercel ls --prod` in that directory).
- [ ] **2.2 Alias production over to it:**
      `vercel alias set <maintenance-deployment-url> devcon.plus` (run from `web/` or
      `ops/maintenance-site/` — alias is account/project-scoped, not directory-scoped, but the
      Vercel CLI needs to be run somewhere linked to the same account).
- [ ] **2.3 Verify:**
      ```bash
      curl -sI https://devcon.plus | head          # expect: HTTP/2 503, retry-after: 172800
      curl -s https://devcon.plus | grep -qi "upgrading\|maintenance" && echo OK
      ```
      If the alias-swap misbehaves, fall back to the `web/vercel.json` rewrite toggle documented
      in `docs/runbooks/maintenance-fallback.md` instead of troubleshooting live — that path is
      the sanctioned break-glass for exactly this failure mode.
- [ ] **2.4 Lock down the API.** SSH or SSM into the backend host and add an admin-IP allowlist
      to the nginx server block (`/etc/nginx/conf.d/00-devcon-plus.conf`) so `/api/*` and
      `/auth/*` 503 with a `{"status":"maintenance"}` JSON body + `Retry-After` for everyone
      except the allowlisted admin IP, which still proxies through. **Preferred:** render
      [`infra/templates/nginx-maintenance.conf.tftpl`](../../infra/templates/nginx-maintenance.conf.tftpl)
      (has the exact enable/verify/disable steps in its header comment) and paste the output into
      the existing `server { }` block, above `location /`. If that template isn't handy mid-incident,
      the `sed`/heredoc one-liner in §5 is the fallback — both produce the same shape of config.
      Either way, finish with: `nginx -t && nginx -s reload`.

  > Do **not** edit `infra/templates/nginx-http.conf.tftpl` (or `nginx-maintenance.conf.tftpl`) and
  > run `terraform apply` for this — the instance has `lifecycle { ignore_changes = [ami, user_data] }`,
  > so Terraform won't push it to the running host anyway. Edit the live file on the host directly;
  > this is a temporary, hand-rolled-back change (§3.2).

- [ ] **2.5 Verify the lockdown** from an *unlisted* network (phone hotspot, etc.):
      `curl -sI https://api.devcon.plus/api/health` → expect `503`. From the allowlisted admin
      IP: same command → expect `200`.

## 3. Bring-up (end of window)

- [ ] **3.1 Smoke test behind the allowlist**, from the admin IP only:
      - `curl -fsS https://api.devcon.plus/api/health` → `200`
      - One sign-in: exercise `/auth/firebase/exchange` (or just sign in through a build pointed
        at the API directly, bypassing the SPA's `devcon.plus` alias) with a real test account
      - One read: `curl -fsS https://api.devcon.plus/api/chapters` (public, cheap, proves
        Supabase connectivity survived the window)
      - One write: register the test account for a low-stakes test event, or hit an endpoint
        that writes a `point_transactions` row — confirm the row lands
      - If anything fails here, **do not proceed to 3.2** — treat it like a go/no-go gate (§4)
- [ ] **3.2 Remove the nginx block.** Revert the `allow`/`deny`/`@maintenance` edit from 2.4,
      `nginx -t && systemctl reload nginx`. Confirm `curl -sI https://api.devcon.plus/api/health`
      returns `200` from a network that was previously blocked.
- [ ] **3.3 Re-alias the frontend:**
      `vercel alias set <production-deployment-url-from-1.3> devcon.plus`
- [ ] **3.4 Verify publicly** (unlisted network again):
      ```bash
      curl -sI https://devcon.plus | head          # expect: HTTP/2 200
      ```
      Load `https://devcon.plus/home` in a real browser, confirm sign-in + dashboard render.
- [ ] **3.5 Un-pause crons:**
      ```sql
      SELECT cron.alter_job(jobid, active := true) FROM cron.job
        WHERE jobname IN ('purge-cron-run-history', 'rate-limit-log-cleanup',
                           'annual-points-reset', 'deactivate-expired-rewards');
      ```
      Re-enable `/api/keep-alive` in the Vercel dashboard (or revert the `web/vercel.json` toggle
      from 1.6 if you went that route).
- [ ] **3.6 Lift the freeze:** `gh workflow enable "Deploy backend (staging)"`, announce merges
      are open again.

## 4. Rollback + go/no-go

- **Hard-stop time:** the time recorded in 1.9. If bring-up (§3) isn't confirmed healthy by
  then, stay dark and escalate rather than flip back on unverified state — a broken "up" looks
  worse than an honest maintenance page.
- **Point of no return:** once you restore from a snapshot (EBS or Supabase PITR), any writes
  that happened between the snapshot and the restore are gone. Only cross this line with
  explicit sign-off from whoever owns the incident — it is not a step you take solo mid-checklist.
- **If the go-dark step (§2) itself fails and won't recover:** fall back to the
  `web/vercel.json` rewrite toggle (`maintenance-fallback.md`) — it's slower (full deploy cycle)
  but doesn't depend on the alias mechanism that just failed.
- **If bring-up (§3) smoke tests fail and the cause isn't a quick fix:**
  1. Re-apply the nginx admin-allowlist block (§2.4) and re-alias `devcon.plus` back to the
     maintenance deployment (§2.2) — go back dark rather than expose a broken backend.
  2. Restore the EC2 root volume from the 1.5 snapshot: stop the instance, detach the current
     root volume, create a new volume from the snapshot in the same AZ, attach as the root
     device, start the instance. (Full commands in §5 — this is destructive to any on-host state
     since the snapshot; confirm no cron/log data you need is only on the current volume first.)
  3. Restore Supabase via PITR to the 1.4 checkpoint timestamp, or via the `pg_dump` artifact if
     PITR isn't available on the project tier. Both are irreversible for data written after the
     restore point — get sign-off first.
  4. Re-run §3 from the top once the restore is verified.

## 5. Copy-paste command block

```bash
# ── vars — fill these in before running anything ──────────────────────────
AWS_REGION=ap-southeast-1
INSTANCE_ID=i-06518a219cae8a703
ADMIN_IP=$(curl -s https://ifconfig.me)/32
PROD_DEPLOYMENT_URL=      # from step 1.3 — the CURRENT devcon.plus deployment, for rollback
MAINT_DEPLOYMENT_URL=     # from step 1.8/2.1 — the ops/maintenance-site deployment
SUPABASE_DB_URL=          # postgres connection string, from Supabase dashboard

# ── 1.2 freeze the workflow that actually serves api.devcon.plus ──────────
gh workflow disable "Deploy backend (staging)"

# ── 1.3 capture rollback target ────────────────────────────────────────────
cd web && vercel ls --prod && vercel inspect "$PROD_DEPLOYMENT_URL"

# ── 1.4 Supabase checkpoint (portable dump; note the timestamp too) ───────
date -u +"PITR checkpoint: %Y-%m-%dT%H:%M:%SZ"
pg_dump "$SUPABASE_DB_URL" -Fc -f "devcon-plus-pre-maint-$(date +%Y%m%dT%H%M%SZ).dump"

# ── 1.5 EBS snapshot of the backend root volume ────────────────────────────
VOLUME_ID=$(aws ec2 describe-instances --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)
aws ec2 create-snapshot --region "$AWS_REGION" --volume-id "$VOLUME_ID" \
  --description "devcon-plus-api pre-maintenance $(date -u +%Y-%m-%dT%H:%M:%SZ)"
# ^ note the returned SnapshotId — needed for the §4 restore path

# ── 1.7 / 3.5 pause / resume pg_cron (run against Supabase SQL editor or psql) ─
# pause:
#   SELECT cron.alter_job(jobid, active := false) FROM cron.job
#     WHERE jobname IN ('purge-cron-run-history','rate-limit-log-cleanup',
#                        'annual-points-reset','deactivate-expired-rewards');
# resume:
#   SELECT cron.alter_job(jobid, active := true) FROM cron.job
#     WHERE jobname IN ('purge-cron-run-history','rate-limit-log-cleanup',
#                        'annual-points-reset','deactivate-expired-rewards');

# ── 2.2 go dark: alias devcon.plus to the maintenance site ─────────────────
cd ops/maintenance-site && vercel deploy --prod   # capture URL as MAINT_DEPLOYMENT_URL if new
vercel alias set "$MAINT_DEPLOYMENT_URL" devcon.plus
curl -sI https://devcon.plus | head

# ── 2.4 lock down the API host (SSM — no SSH key needed) ──────────────────
aws ssm send-command --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters commands="[
    \"cp /etc/nginx/conf.d/00-devcon-plus.conf /etc/nginx/conf.d/00-devcon-plus.conf.bak\",
    \"sed -i '/location \\/ {/a\\\\    allow ${ADMIN_IP};\\\\n    deny all;\\\\n    error_page 403 = @maintenance;' /etc/nginx/conf.d/00-devcon-plus.conf\",
    \"printf '\\\\n  location @maintenance {\\\\n    add_header Retry-After 172800 always;\\\\n    return 503;\\\\n  }\\\\n' >> /etc/nginx/conf.d/00-devcon-plus.conf\",
    \"sed -i 's/^}$/}/' /etc/nginx/conf.d/00-devcon-plus.conf\",
    \"nginx -t && systemctl reload nginx\"
  ]"
# Verify: unlisted network -> 503, ADMIN_IP -> 200, both against /api/health.
# NOTE: the sed above is a best-effort one-liner for the standard 3-line insert; if the
# generated file doesn't nginx -t cleanly, SSM Session Manager in and hand-edit instead:
#   aws ssm start-session --region "$AWS_REGION" --target "$INSTANCE_ID"

# ── 3.2 remove the API lockdown ─────────────────────────────────────────────
aws ssm send-command --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters commands="[
    \"cp /etc/nginx/conf.d/00-devcon-plus.conf.bak /etc/nginx/conf.d/00-devcon-plus.conf\",
    \"nginx -t && systemctl reload nginx\"
  ]"

# ── 3.3 bring the frontend back ─────────────────────────────────────────────
vercel alias set "$PROD_DEPLOYMENT_URL" devcon.plus
curl -sI https://devcon.plus | head

# ── 3.6 lift the freeze ─────────────────────────────────────────────────────
gh workflow enable "Deploy backend (staging)"

# ── §4 restore path (destructive — sign-off required, do not run casually) ─
# EBS: stop instance -> detach root vol -> create volume from SnapshotId (same AZ)
#      -> attach as /dev/xvda -> start instance
#   aws ec2 stop-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
#   aws ec2 create-volume --region "$AWS_REGION" --availability-zone <AZ> \
#     --snapshot-id <SnapshotId> --volume-type gp3
#   # detach old root, attach new volume as /dev/xvda, then:
#   aws ec2 start-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
#
# Supabase: dashboard -> Database -> Backups -> Restore to point in time
#   (target the 1.4 checkpoint timestamp), or restore the pg_dump artifact:
#   pg_restore -d "$SUPABASE_DB_URL" --clean --if-exists devcon-plus-pre-maint-<ts>.dump
```
