# GitHub Actions & Branch Protection Setup

## Branching Strategy (Waterfall)

```
feature/xyz ──PR──→ develop ──PR──→ master (production)
                       │                    │
                  Vercel preview        Vercel prod
                  (staging / QA)        devconplusbeta-v1.vercel.app
```

| Branch | Purpose | Who merges here | Deploys to |
|--------|---------|-----------------|------------|
| `feature/*` | Individual work | Developer creates PR → `develop` | Vercel preview per PR |
| `develop` | Integration + QA | Team merges features during implementation phase | Vercel auto-preview (staging URL) |
| `master` | Production | Team lead PRs `develop` → `master` at release | Vercel prod (with approval gate) |

### Waterfall phase mapping

| Phase | Branch activity |
|-------|----------------|
| **Implementation** | Feature branches PR into `develop` |
| **Integration testing** | Test on the `develop` Vercel preview URL |
| **Release** | PR `develop` → `master`, requires 1 approval |
| **Production** | Merge triggers deploy with manual approval gate |

### Rules

- **Never push directly to `master` or `develop`** — always use PRs
- **Feature branches branch off `develop`**, not `master`
- **Only `develop` merges into `master`** — no feature branches directly to `master`
- **Keep `develop` in sync**: after a release merge, pull `master` back into `develop`

---

## 1. Branch Protection Rules (one-time setup)

### For `master` (production)

Go to **Settings > Branches > Add branch ruleset** for `master`:

- [x] Require a pull request before merging
  - Required approvals: **1**
  - Dismiss stale reviews when new commits are pushed: **on**
- [x] Require status checks to pass before merging
  - Required checks: `Typecheck`, `Lint`, `Test`, `Build`
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

### For `develop` (integration)

Add another branch ruleset for `develop`:

- [x] Require a pull request before merging
  - Required approvals: **1**
- [x] Require status checks to pass before merging
  - Required checks: `Typecheck`, `Lint`, `Test`, `Build`
- [ ] Require branches to be up to date before merging *(optional — can skip for velocity)*

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

Since we deploy production via GitHub Actions with an approval gate, disable
Vercel's auto-deploy for `master` only. Preview deploys for PRs and the
`develop` branch stay enabled (Vercel handles these via Git integration).

Add to `vercel.json`:
```json
{
  "git": {
    "deploymentEnabled": {
      "master": false
    }
  }
}
```

## 5. Workflow Summary

| Trigger | Workflow | What happens |
|---------|----------|-------------|
| PR to `develop` or `master` | `ci.yml` | Typecheck → Lint → Test → Build (parallel, then build) |
| Push to `develop` | Vercel Git integration | Auto-deploys preview URL (staging) |
| PR merged to `master` | `deploy-production.yml` | Validate build → **manual approval** → `vercel --prod` |
| Daily 4:00 AM PHT | `nightly.yml` | Full validation; opens issue on failure |
| Manual | `nightly.yml` | Can be triggered via Actions > Nightly > Run workflow |
