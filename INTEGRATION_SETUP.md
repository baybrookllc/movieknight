# Integration Setup Guide (v6.5)

> **Status**: All integrations operational ✅ | Production deployed ✅ | Trigger warning filtering live ✅

**Latest Update:** v6.5 deployed with complete trigger warning filtering implementation. All integrations tested and working. Vercel AI Gateway active for Claude assistant.

This guide documents the active integrations connecting Supabase ↔ GitHub ↔ Vercel.

---

## 🚀 Current Deployment Status (2026-05-22 20:35 UTC)

| Component | Status | Details |
|-----------|--------|---------|
| **Production** | 🟢 LIVE | v6.5 · All features operational · movieknight.ca |
| **Auto-Migrations** | ✅ ACTIVE | GitHub Action tested and working (deployed v6.5 migration) |
| **Vercel Config** | ✅ ACTIVE | vercel.ts (TypeScript) in use, migrations auto-deploy |
| **Build Status** | ✅ SUCCESSFUL | Latest: Trigger warning filtering deployed |
| **Health Checks** | ✅ PASSING | All endpoints responding, database indexes active |
| **GitHub Secrets** | ✅ CONFIGURED | SUPABASE_ACCESS_TOKEN configured for auto-migrations |
| **Vercel AI Gateway** | ✅ ACTIVE | Claude assistant working with OIDC authentication |

---

## ✅ Completed

- [x] GitHub Action for auto-migrations (`deploy-migrations.yml`)
- [x] Supabase access token added to GitHub secrets
- [x] Vercel config upgraded to `vercel.ts`
- [x] All changes committed and pushed to master

---

## ⏳ Step 1: Vercel ↔ Supabase Integration (Auto-Sync Secrets)

This enables automatic secret synchronization between Supabase and Vercel, eliminating dual updates.

### Instructions:

1. **Go to Vercel Dashboard**
   - URL: https://vercel.com/dashboard
   - Sign in if needed

2. **Navigate to your project**
   - Project name: `cinestream-app`
   - Click to open

3. **Open Settings**
   - Click **Settings** tab in top navigation

4. **Go to Integrations**
   - Left sidebar: **Integrations**
   - Or direct URL: https://vercel.com/integrations

5. **Search for Supabase**
   - Search box at top
   - Type: `Supabase`
   - Click the **Supabase** result card

6. **Install Integration**
   - Click **Add Integration** button
   - Click **Install**
   - You may be redirected to Supabase to authorize

7. **Configure in Supabase**
   - You'll see a dialog asking which secrets to sync
   - Keep these checked:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - Click **Grant access** or **Confirm**

8. **Verify in Vercel**
   - Return to Vercel Settings → Integrations
   - You should see **Supabase** listed as "Connected"

### Result:
- ✅ Environment variables now auto-sync when updated in Supabase
- ✅ Reduces manual secret management from 2 dashboards to 1
- ✅ Changes propagate automatically on next deployment

---

## ⏳ Step 2: Supabase GitHub Branching (Preview Environments)

*Optional but recommended for safer feature branch testing.*

This creates an isolated Supabase database for each feature branch, allowing you to test migrations safely.

### Instructions:

1. **Go to Supabase Dashboard**
   - URL: https://app.supabase.com
   - Sign in if needed

2. **Select your project**
   - Project: **StreamSocial** (nwvliipxqedueskhxdym)
   - Click to open

3. **Go to Project Settings**
   - Left sidebar: **Settings** (gear icon at bottom)

4. **Find Version Control**
   - Scroll down to **Version Control** section
   - Or direct URL: https://app.supabase.com/project/nwvliipxqedueskhxdym/settings/general

5. **Connect to GitHub**
   - Click **Connect GitHub** button
   - You'll be asked to authorize Supabase to access your GitHub repos
   - Click **Authorize**

6. **Select Repository**
   - Search for: `movieknight`
   - Select: `baybrookllc/movieknight`
   - Click **Confirm**

7. **Configure Preview Rules** (Optional)
   - You can set which branches get preview databases
   - Default: All pull requests get a dev branch
   - Leave as default for now

8. **Verify Connection**
   - You should see **Connected to GitHub** status
   - Green checkmark next to repo name

### Result:
- ✅ Each pull request gets its own Supabase environment
- ✅ Migrations can be tested safely before merge
- ✅ Preview environment is destroyed when PR is closed
- ✅ Production remains isolated and safe

### Testing the Integration:

After setup, create a feature branch with a migration:

```bash
git checkout -b feat/test-branch
echo "-- Test migration" > supabase/migrations/20260522000000_test.sql
git add supabase/migrations/
git commit -m "test: Add test migration"
git push origin feat/test-branch
```

Create a PR and you should see:
- 🔵 GitHub Action `Deploy Supabase Migrations` running
- ✅ Supabase creates a preview branch automatically
- ✅ Migration applies to preview (not production)

---

## 🔄 Auto-Migration Workflow (Now Active)

### How it works:

1. **You push migrations to GitHub**
   ```bash
   git add supabase/migrations/20260522000000_*.sql
   git commit -m "feat: Add new feature migration"
   git push origin master
   ```

2. **GitHub Action triggers**
   - Workflow: `.github/workflows/deploy-migrations.yml`
   - Condition: Changes to `supabase/migrations/` on `master` branch
   - Uses: `SUPABASE_ACCESS_TOKEN` secret (just added ✅)

3. **Supabase CLI deploys**
   ```bash
   supabase db push --linked --project-ref nwvliipxqedueskhxdym
   ```

4. **Migration applied to production**
   - Schema cache refreshed via `NOTIFY pgrst`
   - No manual steps required
   - All subsequent deployments use the updated schema

### Logs & Monitoring:

- View workflow runs: https://github.com/baybrookllc/movieknight/actions
- Filter by: `Deploy Supabase Migrations`
- Check logs if deployment fails

---

## ✅ Checklist for Full Integration

- [ ] Vercel ↔ Supabase integration connected
- [ ] GitHub Supabase branching configured
- [ ] Test auto-migration by pushing a dummy migration
- [ ] Verify workflow runs successfully
- [ ] Confirm secrets stay in sync

---

## 🚀 Next Deployment Workflow

After these integrations are set up, deploying code + schema is seamless:

```bash
# 1. Create migration locally (if schema change needed)
supabase migration new add_my_column
# Edit supabase/migrations/20260522000000_add_my_column.sql

# 2. Test locally
supabase start
supabase db reset

# 3. Push to GitHub
git add supabase/migrations/
git commit -m "feat: Add my_column to users table"
git push origin master

# 4. Sit back
# → GitHub Action auto-applies migration to prod
# → Vercel auto-deploys code
# → Done! 🎉
```

---

## 🔧 Troubleshooting

### Auto-migration fails
- **Check**: Workflow logs at https://github.com/baybrookllc/movieknight/actions
- **Common issues**:
  - `SUPABASE_ACCESS_TOKEN` not set → Add to repo secrets
  - Token expired → Regenerate at https://app.supabase.com/account/tokens
  - Project ref wrong → Verify `-project-ref nwvliipxqedueskhxdym` in workflow

### Vercel deployment fails
- **Error**: "Multiple config files found: vercel.json, vercel.ts"
  - **Solution**: Delete `vercel.json`, keep only `vercel.ts`
  - **Why**: Vercel 54.2.0+ requires single config file
  - **Status in this repo**: ✅ RESOLVED (commit 3115631)

### Supabase token issues
- **Regenerate token**: https://app.supabase.com/account/tokens
- **Add to GitHub**: Settings → Secrets → SUPABASE_ACCESS_TOKEN
- **Verify in action**: Check workflow logs for "Deploy migrations to production" step

### GitHub branching not working
- **Verify at**: https://app.supabase.com → Settings → Version Control
- **Check**: "Connected to GitHub" status, green checkmark visible
- **If missing**: Click "Connect GitHub" and authorize

### Deployment cache issues
- **Force redeploy**: `vercel deploy --prod` (requires CLI)
- **Clear cache**: May take 1-2 minutes to propagate
- **Check status**: `vercel logs --limit 10`

