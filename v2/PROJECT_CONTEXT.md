# SNU University Platform V2 — Canonical Project Context

> Persistent shared memory. Every model must read it before work and update it in the same meaningful commit.

## Identity
- Repository: `Tareq612345/snu_web`
- Active branch: `rebuild/snu-portals-supabase`
- PR: `#7` draft; do not merge.
- Active code: `v2/`; root is legacy/reference-only.
- Stack: React 19, Vite 8, React Router 7, Supabase.
- Supabase project: `ixqpqognqifeemeamnbm`.
- Target hosting: Cloudflare Workers/Pages static assets with custom domains.

## Mandatory rules
- Never touch/merge `main` without approval.
- Run package/build/deploy commands from `v2`, not repository root.
- RLS/server checks are authorization; UI checks are not.
- No service-role keys/tokens/passwords in browser, repository, logs, or chat.
- Bounded/paginated reads only.
- Do not claim migration/deployment success without evidence.
- Update this file with every meaningful change.

## Dependency policy
- At each session start inspect `v2/package.json`, lockfile, runtime/build logs, and official security/release notes.
- Check `npm outdated` when network is available.
- Use latest stable, non-prerelease, mutually compatible versions.
- Do not blindly jump to incompatible majors: read migration notes, upgrade incrementally, regenerate lockfile, run tests/build, document result.
- Pin exact versions. Never use legacy root dependency versions for V2.

## Architecture
- Bounded CRUD: Supabase client + RLS.
- Aggregates/read models/transactions: PostgreSQL RPC.
- Privileged Auth/admin actions: Edge Functions.
- Files: private Storage + signed URLs.
- Realtime: notification deltas only.
- Target folders: `app/`, feature modules, `shared/`, thin route pages.

## Roles
- Student: active enrollment and own records/support.
- Faculty: assigned courses/rosters; no platform support.
- Admin: management/support; cannot alter own role/status.
- Owner: protected `platform_owners`; may create admins.

## Performance
- Admin dashboard: 6 requests → 1 RPC after migration `013`.
- Course workspace: currently 6; next target 1 RPC.
- Lists currently 100–500 rows; target 25/page.
- Targets: read p95 <500ms, writes <1s excluding uploads, errors <1%, DB CPU <70%, pool <70–80%.

## Security backlog
- [ ] MFA owner/admin.
- [ ] CAPTCHA/Turnstile.
- [ ] Session/inactivity and sensitive-action reauth.
- [ ] Admin audit log/rate limits.
- [ ] Rotate/remove legacy keys.
- [ ] Admin BFF/HttpOnly-cookie decision.

## Migrations
- `001`–`012`: repository ✅; applied state needs environment confirmation.
- `013_admin_dashboard_read_model.sql`: repository ✅; must be applied.
- Run in numeric order; never rewrite applied migrations.

## Edge Functions
- `admin-create-user`: code ✅; deployed ✅ to `ixqpqognqifeemeamnbm` on 2026-09-16.

## Hosting state
- [x] Cloudflare selected.
- [x] Migration guide added.
- [x] `v2/wrangler.jsonc` added for static `dist` + SPA fallback.
- [x] First failure diagnosed: Cloudflare built legacy root with Vite 5.4.21.
- [ ] In Cloudflare `snu-web` set production branch to `rebuild/snu-portals-supabase`.
- [ ] Set Root directory to `v2`.
- [ ] Build: `npm run test && npm run build`.
- [ ] Deploy: `npx wrangler deploy`.
- [ ] Add V2 environment variables and redeploy.
- [ ] Verify combined deployment, then create role-specific projects/custom domains.
- [ ] Update Supabase Auth URLs; keep Netlify 48h rollback.

## Completed
- [x] Role builds, PKCE/profile guards, RLS, private storage, CSP.
- [x] Owner-aware accounts and secure account Edge Function.
- [x] Courses/structure/enrollment/staff assignment/workspaces/material tracks.
- [x] Announcements/assignments/grading/quizzes/attendance/notifications/support.
- [x] Multi-agent context/instructions.
- [x] Admin dashboard request consolidation.

## Roadmap
1. **Hosting:** complete Cloudflare settings and verification.
2. **Requests:** course workspace RPC; shared API helpers; bounded cache.
3. **Maintainability:** split `AcademicOperations.jsx`; remove unused quiz code.
4. **Pagination:** users/notifications/materials/support/rosters/assignments/submissions.
5. **Security:** MFA/CAPTCHA/audit/rate limits/legacy key rotation.
6. **Capacity:** realistic staging data, E2E, k6 50→2,000 concurrent users.

## Multi-model handoff
At start read root `AGENTS.md` and this file, confirm branch/root, check dependencies, select one roadmap item. At finish verify tests/request count/RLS, update this file, and state manual steps.

```text
Task:
Status:
Branch/head:
Files changed:
Migration/function changes:
Security decisions:
Dependency decisions:
Request-count change:
Tests/checks:
Manual steps:
Next task:
```

## Changelog
- **2026-09-17 — Cloudflare build fix:** added explicit Worker static-assets config, diagnosed legacy-root Vite mismatch, documented exact build/branch/root settings, and added latest-stable dependency policy.
- **2026-09-17 — Hosting:** selected Cloudflare and documented migration/custom domains.
- **2026-09-17 — Performance:** admin dashboard 6 requests → 1 RPC (`013`).
- **2026-09-17 — Project memory:** canonical context and model instructions.
- **2026-09-16 — Accounts/security/features:** owner protection, Edge Function, academic operations, support and write hardening.

## Next action
In Cloudflare update `snu-web` Settings → Builds: branch `rebuild/snu-portals-supabase`, root `v2`, build `npm run test && npm run build`, deploy `npx wrangler deploy`; then redeploy.
