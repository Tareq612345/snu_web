# SNU University Platform V2 — Canonical Project Context

> Persistent shared memory. Read before work; update with every meaningful commit.

## Identity
- Repository: `Tareq612345/snu_web`
- Branch: `rebuild/snu-portals-supabase`; PR `#7` draft, no merge.
- Active code: `v2/`; root is legacy/reference-only.
- Stack: React 19, Vite 8, React Router 7, Supabase.
- Supabase project: `ixqpqognqifeemeamnbm`.
- Hosting target: Cloudflare static Workers with separate student/faculty/admin projects and custom domains.

## Rules
- Never touch/merge `main` without approval.
- Run commands from `v2`, not legacy root.
- RLS/server checks are authorization; UI checks are not.
- Never expose secrets/tokens/passwords.
- Bounded/paginated reads only.
- Use latest stable non-prerelease mutually compatible dependencies; check official release/security notes, upgrade incrementally, pin versions, update lockfile, test.
- Do not claim migration/deployment success without evidence.

## Architecture
- Bounded CRUD: Supabase client + RLS.
- Aggregates/read models/transactions: PostgreSQL RPC.
- Privileged Auth/admin: Edge Functions.
- Private Storage + signed URLs; Realtime for deltas only.
- Target folders: app, feature modules, shared, thin pages.

## Performance state
- Admin dashboard: 6 requests → 1 RPC after `013`.
- Student/Faculty home: one bounded course request (6 rows), no added dashboard requests.
- Duplicate legacy home exports removed from `PortalPages.jsx` to reduce its lazy chunk.
- Course workspace: 6 requests; next target 1 RPC.
- Lists 100–500 rows; target 25/page.
- Targets: read p95 <500ms, writes <1s excluding uploads, errors <1%, DB CPU <70%, pool <70–80%.

## UI system
- Student and Faculty dashboards share a restrained university design system: deep green, warm gold accent, structured cards, role-specific quick actions, SVG icons, responsive RTL navigation.
- Accessibility baseline: semantic regions, skip link, visible focus, contrast, reduced-motion handling, responsive touch targets.
- No external font/icon dependency was added.

## Security backlog
- [ ] MFA owner/admin, CAPTCHA, session policy/reauth.
- [ ] Admin audit log and rate limits.
- [ ] Rotate legacy keys.
- [ ] Admin BFF/HttpOnly-cookie decision.

## Database/backend
- Migrations `001`–`012`: repo ✅, applied state needs confirmation.
- `013_admin_dashboard_read_model.sql`: repo ✅, must be applied.
- `admin-create-user`: deployed ✅ to `ixqpqognqifeemeamnbm` on 2026-09-16.

## Hosting state
- [x] `snu-web` combined Worker builds successfully from `v2`.
- [x] Production/preview Worker URLs enabled.
- [x] Supabase URL, publishable key, `VITE_PORTAL_TYPE=all`, Node 22 configured and successful rebuild verified.
- [x] Added explicit configs: `wrangler.student.jsonc`, `wrangler.faculty.jsonc`, `wrangler.admin.jsonc`.
- [x] Created `snu-student`; build completed successfully.
- [x] Created `snu-faculty`; build completed successfully.
- [ ] Verify refreshed Student and Faculty UI, role login, and responsive view.
- [ ] Create `snu-admin` with admin deploy config/env.
- [ ] Add Supabase Auth redirect URLs.
- [ ] Attach owned custom domains; retain rollback for 48h.
- [x] Netlify builds paused through `netlify.toml` ignore command; existing deploys remain available for rollback.

## Completed features
- [x] Role builds, PKCE/profile guards, RLS, private storage, CSP.
- [x] Owner-aware account management and secure account creation.
- [x] Courses/structure/enrollment/staff/workspaces/material tracks.
- [x] Announcements/assignments/grading/quizzes/attendance/notifications/support.
- [x] Multi-agent context/instructions and dashboard request consolidation.
- [x] Student/Faculty visual refresh based on established university portal/design-system patterns.

## Roadmap
1. Visual QA of Student/Faculty on desktop and mobile; fix only observed issues.
2. Create Admin Cloudflare project.
3. Course workspace RPC; shared API helpers; bounded cache.
4. Split `AcademicOperations.jsx`; remove unused quiz code.
5. Paginate large lists and submissions.
6. MFA/CAPTCHA/audit/rate limits/legacy key rotation.
7. Staging data, E2E, k6 50→2,000 concurrent users.

## Build mechanics
A commit pushed to the configured production branch triggers Cloudflare automatically. From `v2`, Cloudflare runs `npm ci`, tests/build, then the project-specific Wrangler deploy command. Vite environment changes require a new build. Netlify builds are temporarily canceled by `ignore = "exit 0"` without deleting the existing rollback deployments.

## Changelog
- **2026-09-17 — Student/Faculty UI:** introduced shared academic dashboard system, role-specific quick actions, responsive RTL navigation, accessible SVG icons, and bounded 6-course home query; removed duplicate home module code.
- **2026-09-17 — Netlify pause:** canceled future Netlify builds while preserving existing deployed sites for rollback.
- **2026-09-17 — Portal split:** Student and Faculty Cloudflare Workers created and deployed.
- **2026-09-17 — Cloudflare:** fixed root, lockfile and redirect failures; combined Worker build succeeded with Supabase variables.
- **2026-09-17 — Performance/context:** admin dashboard RPC and multi-model memory.
- **2026-09-16 — Features/security:** academic operations, owner accounts, secured support/writes.

## Next action
Wait for Student and Faculty Cloudflare builds, then visually verify both dashboards at desktop and mobile widths before filming.
