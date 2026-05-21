# GitHub Actions & Branch Protection Setup

## 1. Branch Protection Rules (one-time setup)

Go to **Settings > Branches > Add branch ruleset** for `master`:

- [x] Require a pull request before merging
  - Required approvals: **1**
  - Dismiss stale reviews when new commits are pushed: **on**
- [x] Require status checks to pass before merging
  - Required checks: `Typecheck`, `Lint`, `Test`, `Build`
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

## 2. GitHub Environments (one-time setup)

Go to **Settings > Environments > New environment**: `production`

- [x] Required reviewers: add at least 1 team member
  - This creates an approval gate before every production deploy
- [x] Deployment branches: `master` only

## 3. Repository Secrets (required for deploy workflow)

Go to **Settings > Secrets and variables > Actions > New repository secret**:

| Secret | Where to find it |
|--------|-----------------|
| `VERCEL_TOKEN` | vercel.com > Settings > Tokens > Create |
| `VERCEL_ORG_ID` | `vercel.json` or `vercel link` output (`.vercel/project.json`) |
| `VERCEL_PROJECT_ID` | `vercel.json` or `vercel link` output (`.vercel/project.json`) |

To get the org and project IDs:
```bash
npx vercel link
cat .vercel/project.json
```

## 4. Disable Vercel Auto-Deploy for Production

Since we're deploying via GitHub Actions with approval gates, disable Vercel's
auto-deploy for the production branch:

1. Go to your Vercel project > Settings > Git
2. Under "Production Branch", keep `master`
3. Under "Ignored Build Step", you can leave as-is (preview deploys for PRs will still work via Vercel Git integration)

Alternatively, if you want full control, add to `vercel.json`:
```json
{
  "git": {
    "deploymentEnabled": {
      "master": false
    }
  }
}
```

This keeps preview deploys on PRs but routes production deploys through the
GitHub Actions approval workflow.

## 5. Workflow Summary

| Trigger | Workflow | What happens |
|---------|----------|-------------|
| PR opened/updated | `ci.yml` | Typecheck → Lint → Test → Build (parallel, then build) |
| PR merged to master | `deploy-production.yml` | Validate build → **manual approval** → `vercel --prod` |
| Daily 4:00 AM PHT | `nightly.yml` | Full validation; opens issue on failure |
| Manual | `nightly.yml` | Can be triggered via Actions > Nightly > Run workflow |
