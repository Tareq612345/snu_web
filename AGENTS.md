# SNU Web — mandatory agent instructions

## Scope
- The active rebuild is `v2/` on branch `rebuild/snu-portals-supabase`.
- Root-level legacy files are reference-only. Do not modify, delete, migrate, or deploy them unless the user explicitly approves a separate legacy task.
- Do not merge into or modify `main` without explicit user approval.

## Source of truth
Before planning, editing, or answering implementation-status questions, read:

`v2/PROJECT_CONTEXT.md`

It is the canonical project memory for all AI models and humans.

## Required workflow
1. Read `v2/PROJECT_CONTEXT.md` and the files relevant to the requested feature.
2. Confirm current branch/head before writing.
3. Reuse existing services, migrations, policies, components, and routes; do not duplicate features.
4. Keep reads bounded and paginated. Avoid fetching entire tables or nested unbounded relations.
5. Use direct Supabase reads for simple bounded queries, SQL RPCs for aggregate/read-model/transactional work, and Edge Functions only for privileged server-side actions.
6. Treat RLS as the authorization boundary. UI hiding is not authorization.
7. Never expose service-role keys, access tokens, refresh tokens, passwords, database passwords, or personal data in code, commits, logs, screenshots, or chat.
8. Run available tests/build checks and inspect deploy checks.
9. In the same commit as every meaningful change, update `v2/PROJECT_CONTEXT.md`:
   - mark completed checklist items;
   - add new work and blockers;
   - record migrations/functions/deployment steps;
   - append a short changelog entry;
   - set the next recommended task.
10. Never mark a migration or deployment as applied merely because its file exists. Record it as applied only after command/dashboard evidence.

## Performance rules
- Target no more than 2 data requests for initial dashboard rendering and no more than 2 for a course workspace shell.
- Prefer one purpose-built RPC over many count or aggregate requests.
- Default page size: 25; maximum normal page size: 100.
- Do not load all submissions, notifications, users, or messages in one request.
- Realtime is for notification deltas and explicitly justified events, not as a replacement for paginated reads.

## Completion rule
A task is not complete until code, authorization, error handling, documentation, and verification are addressed. Database-dependent work must explicitly state which migrations still need applying.
