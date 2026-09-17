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
- Use latest stable non-prerelease mutually compatible dependencies; pin versions, update lockfile, test.
- Do not claim migration/deployment success without evidence.
- For UI work, `DESIGN_SYSTEM.md` is binding and must be audited before/after changes.

## Architecture
- Bounded CRUD: Supabase client + RLS.
- Aggregates/read models/transactions: PostgreSQL RPC.
- Privileged Auth/admin: Edge Functions.
- Private Storage + signed URLs; Realtime for deltas only.

## Performance state
- Admin dashboard: 6 requests → 1 RPC after `013`.
- Student/Faculty home: one bounded course request, maximum 6 rows.
- Duplicate legacy home exports removed from `PortalPages.jsx`.
- Editorial CSS adds no runtime requests or dependencies.
- Course workspace: 6 requests; next target 1 RPC.
- Lists 100–500 rows; target 25/page.
- Targets: read p95 <500ms, writes <1s excluding uploads, errors <1%, DB CPU <70%, pool <70–80%.

## UI system
- Product-owner-approved direction: **Editorial University**. Canonical specification: `DESIGN_SYSTEM.md`.
- Palette: warm paper, ink navy, rare oxblood and brass. Dominant green is explicitly rejected.
- Flat layers, editorial rules, asymmetric masthead, service-first lists, minimal radius/shadow.
- Hard bans include gradients, glassmorphism, side-stripe cards, repeated icon bubbles, identical SaaS card grids, invented metrics, filler copy, and decorative motion.
- Accessibility: semantic regions, skip link, visible focus, contrast, reduced motion, responsive RTL.
- MyU was verified as the SNU Ibn Al-Haitham student-services portal through text retrieval; sandbox DNS blocked reliable pixel capture, so exact visual parity is not claimed without an owner screenshot.

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
- [x] `snu-web`, `snu-student`, and `snu-faculty` created and previously built successfully.
- [x] Separate Wrangler configs and environment variables configured.
- [ ] Verify Editorial University deployment builds.
- [ ] Owner visual QA of refreshed Student/Faculty desktop and mobile pages.
- [ ] Create `snu-admin` with admin deploy config/env.
- [ ] Add Supabase Auth redirect URLs and custom domains.
- [x] Netlify builds paused; existing deploys remain rollback.

## Completed features
- [x] Role builds, PKCE/profile guards, RLS, private storage, CSP.
- [x] Owner-aware account management and secure account creation.
- [x] Courses/structure/enrollment/staff/workspaces/material tracks.
- [x] Announcements/assignments/grading/quizzes/attendance/notifications/support.
- [x] Multi-agent context/instructions and dashboard request consolidation.
- [x] User-selected Editorial University visual direction and permanent anti-generic design policy.

## Roadmap
1. Visual QA of Editorial Student/Faculty on desktop and mobile; fix only observed issues.
2. Create Admin Cloudflare project.
3. Course workspace RPC; shared API helpers; bounded cache.
4. Split `AcademicOperations.jsx`; remove unused quiz code.
5. Paginate large lists and submissions.
6. MFA/CAPTCHA/audit/rate limits/legacy key rotation.
7. Staging data, E2E, k6 50→2,000 concurrent users.

## Build mechanics
A commit pushed to the production branch triggers Cloudflare automatically. Cloudflare runs `npm ci`, tests/build, then project-specific Wrangler deploy. Vite environment changes require a new build. Netlify is canceled by `ignore = "exit 0"`.

## Changelog
- **2026-09-17 — Editorial redesign:** owner rejected dominant green and selected Editorial University. Added binding design system and anti-AI instructions; replaced gradients/rounded-card language with paper, ink navy, oxblood, rules, and flat service-first composition.
- **2026-09-17 — Student/Faculty UI:** shared dashboards, role quick actions, SVG icons, bounded 6-course query, duplicate module removal.
- **2026-09-17 — Netlify pause:** future Netlify builds canceled, existing sites preserved.
- **2026-09-17 — Portal split:** Student and Faculty Cloudflare Workers created and deployed.
- **2026-09-17 — Cloudflare:** fixed root, lockfile and redirect failures.
- **2026-09-17 — Performance/context:** admin dashboard RPC and multi-model memory.
- **2026-09-16 — Features/security:** academic operations, owner accounts, secured support/writes.

## Next action
Wait for all Cloudflare checks, then owner sends refreshed Student and Faculty screenshots plus one MyU screenshot for exact brand-comparison QA before filming.
