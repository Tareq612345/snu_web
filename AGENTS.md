# SNU Web — mandatory agent instructions

## Scope
- Active rebuild: `v2/` on `rebuild/snu-portals-supabase`.
- Root-level legacy files are reference-only. Do not modify, deploy, or use their dependencies unless explicitly approved.
- Never modify or merge `main` without explicit approval.

## Source of truth
Read `v2/PROJECT_CONTEXT.md` before planning, editing, or answering status questions. It is the canonical shared memory for all models.

## Required workflow
1. Read `v2/PROJECT_CONTEXT.md` and relevant feature files.
2. Confirm branch/head and confirm commands run from `v2/`, never the legacy repository root.
3. Reuse existing routes, services, migrations, policies, and components.
4. Keep reads bounded/paginated; avoid nested unbounded relations.
5. Use Supabase direct reads for bounded CRUD, RPCs for aggregates/transactions, and Edge Functions for privileged server work.
6. Treat RLS/server checks as authorization; UI hiding is not authorization.
7. Never expose secrets, tokens, passwords, or personal data.
8. Run tests/build/deploy checks.
9. Update `v2/PROJECT_CONTEXT.md` in the same commit: status, blockers, migrations/functions, verification, changelog, next task.
10. Never mark migrations/deployments applied without command/dashboard evidence.

## Dependency freshness policy
At the start of each implementation session:
1. Inspect `v2/package.json`, the lockfile when present, runtime/build logs, and official release/security notices.
2. Check for outdated dependencies with the package manager (`npm outdated`) when network access is available.
3. Use the latest **stable, non-prerelease, mutually compatible** versions supported by the runtime and hosting platform.
4. Never upgrade blindly to an incompatible major merely because it is numerically highest. Read migration notes, update one major at a time, regenerate the lockfile, and run tests/builds.
5. Pin exact production dependency versions and commit the lockfile.
6. Do not infer V2 versions from root legacy `package.json`; Cloudflare/CI root directory must be `v2`.
7. Record every dependency/runtime upgrade and compatibility decision in `v2/PROJECT_CONTEXT.md`.

## Performance rules
- Maximum 2 data requests for initial dashboard and course shell.
- Prefer one purpose-built RPC over multiple aggregate requests.
- Default page size 25; normal maximum 100.
- Realtime is for justified deltas, not bulk reads.

## Completion rule
Code, authorization, error handling, documentation, and verification are all required. State every manual database/hosting step explicitly.
