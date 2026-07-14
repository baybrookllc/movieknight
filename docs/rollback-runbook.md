# MovieKnight — Migration Rollback Runbook

What to do when a deployed migration turns out to be wrong. Two tiers,
ordered by how much of the database it touches — use the cheaper one
unless it genuinely can't fix the problem.

| Setting | Value |
|---------|-------|
| Project Ref | `nwvliipxqedueskhxdym` |
| Dashboard | https://supabase.com/dashboard/project/nwvliipxqedueskhxdym |
| Backups | https://supabase.com/dashboard/project/nwvliipxqedueskhxdym/database/backups/scheduled |

---

## Decision tree

1. **Did the bad migration change schema/logic but not destroy data** (wrong
   constraint, bad default, broken function, wrong RLS policy, missing
   index)? → **Tier 1: forward-fix migration.** This is almost always the
   right answer — it's fast, has no downtime, and doesn't touch anything
   the bad migration didn't.
2. **Did the bad migration destroy or corrupt data** (a DELETE/UPDATE with
   a wrong WHERE clause, a DROP TABLE, a lossy column-type change that's
   already overwritten values) **and Tier 1 can't recover the lost data**?
   → **Tier 2: point-in-time restore.** This rolls back the *entire*
   database to a timestamp before the bad migration ran — including
   losing any legitimate writes (new signups, watch history, messages,
   etc.) that happened after that point. Only reach for this when Tier 1
   genuinely can't fix it.

---

## Tier 1 — Forward-fix migration (the common case)

Write a new migration that undoes the bad change, exactly like every
other migration in `supabase/migrations/`. No different tooling, no
downtime, no data loss beyond what the bad migration itself already
caused.

### Procedure

1. **Identify the exact bad change.** Read the migration file that
   introduced it. Confirm via `mcp__supabase__list_migrations` /
   `supabase migration list` that it's the one actually applied live.
2. **Write the inverse migration** — drop what it added, restore what it
   removed, or correct the logic. Guard it (`IF EXISTS`/`IF NOT EXISTS`)
   the same way every migration in this repo already is, so it's safe to
   re-run.
3. **Validate locally first** — same pattern used for every migration
   this project ships:
   - Spin up a throwaway Postgres 15.8.1.085 container
     (`public.ecr.aws/supabase/postgres:15.8.1.085`) — matches live exactly.
   - Replay the full `supabase/migrations/*` history (reproduces the bad
     migration's effect).
   - Apply your new rollback migration on top.
   - Confirm the specific broken behavior now works, and nothing else
     regressed.
4. **Deploy** via `supabase db push` — same as any other migration.
5. **Verify on live** — re-run whatever check proved the bug (a query,
   an app action, an advisor re-run), confirm it's fixed.

### Worked example (tested 2026-07-13, not a real incident — a
rehearsal to keep this runbook honest)

Simulated a bad migration: `ALTER TABLE public.profiles ADD CONSTRAINT
profiles_username_lowercase_check CHECK (username = lower(username));`
— plausible-looking, deploys clean, then breaks the first mixed-case
username update: `ERROR: new row for relation "profiles" violates check
constraint "profiles_username_lowercase_check"`.

Rollback migration:
```sql
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_lowercase_check;
```

Applied on top of the bad migration in the same local container — the
previously-failing `UPDATE profiles SET username = 'MixedCaseUser' ...`
then succeeded and read back correctly. This is the exact procedure to
follow for a real one: same container image, same replay-then-patch
pattern, same before/after check.

---

## Tier 2 — Point-in-time restore (catastrophic data loss only)

This project has **physical backups with PITR enabled** — confirmed live
via `supabase backups list`:

```
REGION            | BACKUP TYPE | STATUS    | CREATED AT (UTC)
Canada (Central)  | PHYSICAL    | COMPLETED | 2026-07-13 10:55:07
Canada (Central)  | PHYSICAL    | COMPLETED | 2026-07-12 19:16:03
Canada (Central)  | PHYSICAL    | COMPLETED | 2026-07-08 18:45:22
Canada (Central)  | PHYSICAL    | COMPLETED | 2026-07-08 10:53:56
Canada (Central)  | PHYSICAL    | COMPLETED | 2026-07-07 10:54:50
```

### ⚠️ Before you do this

- **This restores the whole database to a single point in time.** Every
  write after that timestamp — every new signup, watch-history entry,
  message, list, rating — is gone. There is no partial/table-scoped
  restore.
- **This causes downtime.** The project is unavailable while the restore
  runs.
- **This was deliberately not live-tested against production** while
  writing this runbook — doing so would itself cause the exact data loss
  and downtime this section warns about. Tier 1 was tested for real
  (above); this section documents the real, correct command based on
  what `supabase backups list`/`restore --help` actually expose for this
  project, but the restore itself has not been executed.

### Procedure

1. **Stop the bleeding first** — if the bad migration is still running or
   about to run again (e.g. a scheduled job), disable it so the damage
   doesn't compound while you decide on a restore point.
2. **Pick the restore timestamp** — the moment *before* the bad migration
   ran. `supabase backups restore` takes epoch seconds:
   ```bash
   date -d "2026-07-13T10:00:00Z" +%s   # → epoch seconds for your chosen instant
   ```
3. **Confirm with the user first.** This is a production-data-loss action
   — get explicit sign-off on the exact timestamp and the data-loss window
   it implies before running anything.
4. **Restore:**
   ```bash
   supabase backups restore --project-ref nwvliipxqedueskhxdym --timestamp <epoch_seconds>
   ```
5. **After restore completes:** run `supabase migration list` to check
   Local↔Remote parity — a restore rewinds the migration-history table
   along with everything else, so any migrations applied *after* the
   restore point will show as "not applied" and may need re-running
   (check each one for idempotency before re-applying).
6. **Re-run the app's own smoke checks** (`/api/health`, a login,
   a browse query) before considering the incident closed.

---

## Why not full down-migrations for all 40+ files?

Considered and deliberately out of scope here: writing a tested "down"
migration for every one of the 40+ files in `supabase/migrations/` so any
single migration could be cleanly un-applied in isolation. That's real,
valuable work, but it's a multi-day project of its own (each down-migration
needs the same local-replica validation every forward migration gets) and
doesn't change what you'd actually do in an incident — Tier 1 (write the
specific fix needed) already covers the realistic cases without that
up-front investment. Worth doing later if the team wants full down-migration
coverage as a matter of policy, not because Tier 1 is inadequate.
