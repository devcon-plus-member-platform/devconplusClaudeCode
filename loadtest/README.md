# Load test — staging API (t3.small)

Measures whether the single t3.small staging backend holds at a launch-like load (esp. the
check-in rush), so we can decide: do nothing / vertical-bump / autoscale. **Staging only**
(`api.cloud-engineer.dev`) — never point this at prod (`plus.devcon.ph`). Judge the verdict from
**server-side CloudWatch metrics** (CPU + CPUCreditBalance), not client latency (which includes
trans-Pacific RTT).

## Prerequisites
- **k6** installed: `winget install k6.k6` (Windows) / `brew install k6` / or the binary from grafana.com.
- The **env-configurable throttler** must be deployed to staging (this branch's `app.module.ts` change),
  so we can lift the 300 req/min per-IP flood guard — a single load generator is one IP and trips it at
  ~5 req/s otherwise.
- For the authed scenario: a few **dedicated test accounts** (verified email, member role) in
  `loadtest/test-accounts.json` (gitignored).

## Steps

### 1. Lift the throttle on staging (then revert after!)
The limit is now env-driven (`THROTTLE_LIMIT`, default 300). Raise it on the staging box via SSM:
```bash
REGION=ap-southeast-1; INST=i-02e08aceb6d701d77
aws ssm send-command --region $REGION --instance-ids $INST --document-name AWS-RunShellScript \
  --parameters 'commands=[
    "set -e",
    "cd /opt/devcon-plus/repo/server",
    "grep -q \"^THROTTLE_LIMIT=\" .env.production && sed -i \"s/^THROTTLE_LIMIT=.*/THROTTLE_LIMIT=1000000/\" .env.production || echo \"THROTTLE_LIMIT=1000000\" >> .env.production",
    "docker compose -f docker-compose.ec2.yml up -d --force-recreate api",
    "sleep 8 && curl -fsS http://127.0.0.1:8000/api/health"
  ]'
```
**Revert after the test:** rerun with `THROTTLE_LIMIT=300` (or remove the line) + recreate.

### 2. (Authed only) mint tokens
```bash
node loadtest/mint-tokens.mjs   # reads test-accounts.json + FIREBASE_WEB_API_KEY -> tokens.json (~1h TTL)
```

### 3. Start capturing CloudWatch (run during the test, then read after)
The key t3.small signal is **CPUCreditBalance** (if it drains toward 0, the box throttles to baseline):
```bash
aws cloudwatch get-metric-data --region ap-southeast-1 \
  --start-time "$(date -u -d '-15 min' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --metric-data-queries '[
    {"Id":"cpu","MetricStat":{"Metric":{"Namespace":"AWS/EC2","MetricName":"CPUUtilization","Dimensions":[{"Name":"InstanceId","Value":"i-02e08aceb6d701d77"}]},"Period":60,"Stat":"Average"}},
    {"Id":"credits","MetricStat":{"Metric":{"Namespace":"AWS/EC2","MetricName":"CPUCreditBalance","Dimensions":[{"Name":"InstanceId","Value":"i-02e08aceb6d701d77"}]},"Period":60,"Stat":"Average"}}
  ]'
```
(Memory % comes from the CloudWatch Agent custom namespace `CWAgent` if needed.)

### 4. Run
```bash
# S1 — public read throughput (safe, no tokens)
k6 run loadtest/k6-public.js
# S2 — authed check-in rush (needs tokens.json)
k6 run loadtest/k6-authed.js
# tunables: BASE_URL, TARGET_RPS / VUS, DURATION, POLL_INTERVAL
```
Dry run first at low rate to validate (stays under the cap even before step 1):
`k6 run --env TARGET_RPS=3 --env DURATION=20s loadtest/k6-public.js`

### 5. Verdict
- **t3.small is enough → do nothing** if: p95 < ~500 ms (server-side), errors < ~1%, CPU sustained
  < ~70%, and CPUCreditBalance does NOT trend toward 0.
- **Strained → vertical-bump to t3.medium** (cheap) and/or proceed to Fargate autoscaling if: credits
  drain, p95 climbs, or error rate rises.

### 6. Cleanup
- Revert `THROTTLE_LIMIT` on staging (step 1).
- Delete `tokens.json` (expire anyway). Don't commit `test-accounts.json` / `tokens.json` (gitignored).
