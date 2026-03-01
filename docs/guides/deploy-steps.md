# OppsEra Deploy Procedure (Vercel + Supabase)

## Phase 1: Local Validation (before touching anything remote)

### Step 1 — Run the pre-deploy audit

```bash
pnpm predeploy
```

This runs 9 checks: secrets scan, migration journal integrity, fire-and-forget DB patterns, lint, type-check, build, tests, git hygiene, and env var validation. Any CRITICAL or HIGH finding blocks deploy.

### Step 2 — If predeploy passes, verify individually if needed

```bash
pnpm lint          # Floating-promise detection (CRITICAL for Vercel pool safety)
pnpm type-check    # TypeScript strict mode
pnpm test          # All 5,981+ tests
pnpm build         # Production build (catches missing env vars, import errors)
```

---

## Phase 2: Database Migration (additive-only, BEFORE code deploy)

### Step 3 — Verify migration journal integrity

```bash
# Check the current highest migration index
cat packages/db/migrations/meta/_journal.json | tail -20
```

Confirm your new `.sql` files match the journal entries 1:1, with sequential `idx` values.

### Step 4 — Review your migration SQL for safety

- Every statement must use `IF NOT EXISTS` / `IF EXISTS` (idempotent)
- NO `TRUNCATE`, `DROP TABLE`, `DELETE FROM` without `WHERE`
- NO `ALTER COLUMN ... TYPE` that loses data
- All new tables must have RLS policies
- All new columns should be `NULL` or have `DEFAULT` (additive-only = no breaking changes)

### Step 5 — Run migration against production Supabase

```bash
pnpm db:migrate:remote
```

This reads `.env.remote` (must have `DATABASE_URL` or `DATABASE_URL_ADMIN` pointing to your production Supabase). Uses `max: 1`, `prepare: false` for Supavisor compatibility.

### Step 6 — Verify migration succeeded

Connect to your Supabase SQL editor or use the diagnostic script:

```bash
node tools/scripts/db-deep-diag.cjs
```

Check that new tables/columns exist and RLS policies are active.

---

## Phase 3: Git Push (triggers Vercel deploy)

### Step 7 — Stage and commit (safe staging)

```bash
# Use the deploy script for safe staging (auto-excludes .env, secrets, credentials)
pnpm deploy:prod "your commit message here"
```

Or manually:

```bash
# Stage specific files (NEVER use git add -A)
git add packages/db/migrations/0244_register_tab_sync_foundation.sql
git add packages/db/migrations/meta/_journal.json
git add apps/web/src/...  # your changed files
# etc.

git status  # Review what's staged — NO .env, .pem, credentials

git commit -m "$(cat <<'EOF'
feat: register tab sync foundation + spa module

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

git push origin Bug-Fixes
```

### Step 8 — Create PR to main (if on a feature branch)

```bash
gh pr create --title "Bug fixes and new features" --body "..."
```

CI runs automatically on PR to main (GitHub Actions: preflight + lint + type-check + test + build).

---

## Phase 4: Verify Vercel Deployment

### Step 9 — Monitor the Vercel build

```bash
# Check deployment status via Vercel CLI (if installed)
npx vercel ls

# Or watch GitHub Actions
gh run list --limit 5
gh run watch  # live tail the latest run
```

### Step 10 — Check the Vercel build logs for common failures

| Failure | Cause | Fix |
|---|---|---|
| Module not found | Missing `workspace:*` dep or export | Add to `package.json`, verify `transpilePackages` |
| Type error | Strict TS in build mode | Fix the type error locally, push again |
| env var missing | Build needs env vars | Set in Vercel Dashboard (not `vercel.json`) |
| EPERM `.next/trace` | Windows artifact in git | Should not happen in Vercel Linux — check `.gitignore` |
| outputDirectory error | Double-nested path | Remove `outputDirectory` from `vercel.json` — use Dashboard only |

### Step 11 — Smoke test the deployed URL

```bash
# Health check (no DB)
curl -s https://your-app.vercel.app/api/health/light

# Full health check (with DB)
curl -s https://your-app.vercel.app/api/health

# Test login flow
curl -s https://your-app.vercel.app/api/v1/auth/me -H "Authorization: Bearer <token>"
```

---

## Phase 5: Post-Deploy Verification

### Step 12 — Check for pool exhaustion (production safety)

```bash
# Run the diagnostic against production
node tools/scripts/db-deep-diag.cjs
```

Look for:

- Connections stuck in `ClientRead` state (zombie connections)
- Total connections near the pool limit
- `statement_timeout` is 30s (Supabase may reset it)

### Step 13 — Verify new features work

- Open the app in browser, test the critical paths
- Check Vercel function logs for errors: Vercel Dashboard → Deployments → Functions tab
- Check for 500s in the Runtime Logs tab

---

## Quick Reference: The One-Liner Deploy

If everything is already committed and you just want the full validation + migrate + push:

```bash
pnpm deploy:prod "fix: your commit message"
```

This runs the entire pipeline: preflight checks → lint → build → type-check → test → migrate remote → safe git add → commit → push.

Flags for partial runs:

```bash
pnpm deploy:prod "msg" --skip-tests     # Skip tests (risky)
pnpm deploy:prod "msg" --skip-build     # Skip build (if CI will catch it)
pnpm deploy:prod "msg" --skip-migrate   # Skip migration (if no schema changes)
pnpm deploy:prod "msg" --dry-run        # Show what would execute without running
```

---

## Critical Reminders

- **Migrations run BEFORE code deploy** — new code can reference new tables, but old code must still work with new schema (additive-only)
- **Never TRUNCATE production** — additive only means `CREATE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`
- **Vercel Dashboard settings override `vercel.json`** — root directory, build command, output directory all live in Dashboard
- **`prepare: false` is mandatory** for Supavisor (transaction pooling on port 6543)
- **Check `statement_timeout` after deploy** — Supabase may reset `ALTER DATABASE` settings
- **Lint is not optional** — floating-promise detection prevents the pool exhaustion outages you had on 2026-02-27 and 2026-02-28
