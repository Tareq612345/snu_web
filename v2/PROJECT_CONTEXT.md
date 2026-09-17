# SNU University Platform V2 — Canonical Project Context

> **Purpose:** persistent project memory and handoff document for every AI model and human contributor.
>
> **Mandatory:** read this file before making changes. Update it in the same commit as every meaningful change.

## 1. Project identity

| Item | Value |
|---|---|
| Repository | `Tareq612345/snu_web` |
| Active branch | `rebuild/snu-portals-supabase` |
| Pull request | `#7` — draft, do not merge yet |
| New platform root | `v2/` |
| Legacy platform | repository root; reference-only |
| Frontend | React 19 + Vite 8 + React Router 7 |
| Backend | Supabase Auth, Postgres, RLS, Storage, Realtime, Edge Functions |
| Hosting | separate Netlify student/faculty/admin builds |
| Supabase project ref | `ixqpqognqifeemeamnbm` |
| Current documented head | `be18ab93d854e02caced122f087d27eb8c35758b` before this document commit |

## 2. Non-negotiable rules

- [ ] Never edit or merge `main` without explicit owner approval.
- [ ] Never treat the legacy root as the active implementation.
- [ ] Never put `SUPABASE_SERVICE_ROLE_KEY` in Vite, Netlify, GitHub, browser code, or chat.
- [ ] Never trust UI role checks alone; enforce access with RLS/functions.
- [ ] Never fetch unbounded tables or deeply nested unbounded relations.
- [ ] Never claim a migration is applied without SQL/CLI/dashboard evidence.
- [ ] Every meaningful commit must update this file.
- [ ] Every new feature must include authorization, loading/error/empty states, and verification.

These boxes intentionally remain unchecked: they are recurring rules, not one-time tasks.

## 3. User roles and trust model

### Student
- Reads only active enrollment data.
- Reads published course content.
- Submits own assignments and quiz attempts.
- Checks into attendance through secure RPC.
- Sees and replies only to own support requests.

### Faculty
- Reads assigned courses and enrolled rosters for those courses.
- Publishes course materials, announcements, assignments, quizzes, and attendance sessions only for assigned courses.
- Grades submissions only in assigned courses.
- Does **not** receive or view platform support requests.

### Admin
- Manages academic structure, enrollments, teaching assignments, users, and support.
- Cannot demote or disable the currently signed-in admin account.
- Non-owner admins cannot create or modify admin accounts.

### Platform owner
- Stored in `public.platform_owners` after migration `012`.
- Existing active admin account(s) are bootstrapped as owner when migration `012` first runs.
- Owner account cannot be demoted or disabled.
- Owner may create another admin through the secured Edge Function.

## 4. Current architecture

### Frontend
- `src/App.jsx`: route composition and role portal boundaries.
- `src/context/AuthContext.jsx`: one Supabase client, session lifecycle, active profile load.
- `src/components/PortalLayout.jsx`: role-specific navigation.
- `src/pages/CourseWorkspace.jsx`: courses, course workspace, materials, uploads.
- `src/pages/AdminUsersPage.jsx`: owner-aware account management.
- `src/pages/AcademicOperations.jsx`: currently oversized; must be split by feature.
- Route pages are lazy-loaded; Vite splits React, router, and Supabase vendor chunks.

### Data access decision
- Simple bounded CRUD: Supabase client + RLS.
- Aggregates, multi-table read models, atomic workflows: PostgreSQL RPC.
- Privileged Auth/admin operations: Edge Functions.
- Files: private Storage buckets + signed URLs + RLS.
- Realtime: notifications only unless another use is explicitly justified.

### Target frontend structure

```text
src/
├── app/                 # router, providers, layouts
├── features/
│   ├── auth/
│   ├── users/
│   ├── courses/
│   ├── materials/
│   ├── assignments/
│   ├── quizzes/
│   ├── attendance/
│   ├── announcements/
│   ├── notifications/
│   └── support/
├── shared/
│   ├── api/
│   ├── components/
│   ├── hooks/
│   ├── validation/
│   ├── errors/
│   └── utils/
└── pages/               # thin route composition only
```

## 5. Request and performance budget

### Current known hotspots

- Course workspace performs 6 parallel data requests on first open.
- Admin dashboard performs 6 count requests.
- Some screens request 100–500 rows without real pagination.
- Assignment queries can embed all submissions for many assignments.
- There is no shared query cache/deduplication layer yet.

### Target budgets

| Flow | Current | Target |
|---|---:|---:|
| Authenticated app bootstrap | session + profile | maximum 2 network requests |
| Admin dashboard | 6 count requests | 1 summary RPC |
| Course workspace shell | 6 requests | 1 read-model RPC, optional paginated detail request |
| Lists | 100–500 rows | 25 rows/page, cursor/range pagination |
| Repeated navigation | refetches | bounded cache + explicit invalidation |

### Performance SLO proposal

- Read p95: `< 500 ms` under expected peak load.
- Write p95: `< 1 s` excluding file upload time.
- Error rate: `< 1%`.
- Database CPU sustained: `< 70%`.
- Pool utilization sustained: `< 70–80%`.
- Realtime notification lag: `< 2 s`.

These are targets; capacity is not proven until staging load tests run.

## 6. Authentication, tokens, and browser security

### Current state
- Supabase client uses PKCE.
- `persistSession: true`, `autoRefreshToken: true`.
- SPA sessions are stored by Supabase in browser storage.
- Access is scoped by JWT + RLS.
- CSP blocks third-party scripts and frames; assets are immutable-cached.
- No service-role key exists in V2 browser code.

### Decision
- Student/faculty portals may remain SPA + PKCE + strict CSP + RLS.
- Before production, admin security must be reviewed for MFA and potentially a BFF/SSR HttpOnly-cookie architecture.
- Do not switch to cookies casually: a cookie architecture requires server-side session handling and CSRF protection.

### Required before production
- [ ] Require MFA for platform owner and admins.
- [ ] Configure login/recovery CAPTCHA or Turnstile.
- [ ] Define session duration, inactivity timeout, and re-authentication for sensitive actions.
- [ ] Add audit logs for admin actions.
- [ ] Rotate/remove legacy exposed third-party keys before production.
- [ ] Put custom domains behind WAF/rate limiting where applicable.

## 7. Database and migrations

| Migration | Purpose | Repository | Applied to Supabase |
|---|---|---:|---:|
| `001` | Initial schema/RLS/storage | ✅ | Needs environment confirmation |
| `002` | Security + indexes | ✅ | Needs environment confirmation |
| `003` | Access hardening | ✅ | Needs environment confirmation |
| `004` | Profiles/comments/avatars | ✅ | Needs environment confirmation |
| `005` | Security audit hardening | ✅ | Needs environment confirmation |
| `006` | Storage completion | ✅ | Needs environment confirmation |
| `007` | Academic levels | ✅ | Needs environment confirmation |
| `008` | Academic operations | ✅ | Needs environment confirmation |
| `009` | Roster + notifications | ✅ | Needs environment confirmation |
| `010` | Course workspace tracks + activity notifications | ✅ | Needs environment confirmation |
| `011` | Final write/support hardening | ✅ | Needs environment confirmation |
| `012` | Owner + account management | ✅ | Needs environment confirmation |

**Rule:** migrations must be applied in numeric order. Do not rerun non-idempotent old migrations blindly against an existing database.

## 8. Edge Functions

| Function | Purpose | Code | Deployment |
|---|---|---:|---:|
| `admin-create-user` | Server-side Auth user creation with owner/admin checks | ✅ | ✅ deployed to project `ixqpqognqifeemeamnbm` on 2026-09-16 |

Deployment command used successfully:

```bash
npx supabase functions deploy admin-create-user --use-api
```

## 9. Completed implementation

### Foundation and security
- [x] V2 React/Vite/Supabase scaffold.
- [x] Separate student/faculty/admin portal builds.
- [x] PKCE session handling and active-profile guard.
- [x] RLS and secure helper functions.
- [x] Private storage with signed downloads.
- [x] Security headers and CSP.
- [x] Owner-aware account protection.
- [x] Secure server-side account creation function.

### Academic features
- [x] Courses and academic structure.
- [x] Enrollment and faculty assignment management.
- [x] Per-course workspace.
- [x] Theory/practical/general material tracks.
- [x] Announcements.
- [x] Assignments, submissions, grading, feedback.
- [x] Atomic quiz creation and server-side grading.
- [x] Attendance sessions with hashed temporary codes.
- [x] Student/faculty rosters.
- [x] Notifications and Realtime delivery.
- [x] Student/admin-only support workflow.
- [x] Admin account creation and role management.

### Deployment
- [x] Netlify preview checks succeeded for student/faculty/site builds on previous feature commits.
- [x] `admin-create-user` Edge Function deployed.
- [ ] Confirm migrations through `012` are applied in the target database.
- [ ] Complete real-account end-to-end testing for all roles.
- [ ] Merge to `main` — explicitly blocked until approval and production readiness.

## 10. Architecture and scalability roadmap

### Phase A — Project memory and guardrails
- [x] Add canonical project context.
- [x] Add multi-agent instruction files.
- [x] Define request budgets and target architecture.

### Phase B — Reduce requests and split features
- [ ] Add `get_admin_dashboard_summary` RPC and replace 6 dashboard requests.
- [ ] Add `get_course_workspace` RPC and replace 6 course requests.
- [ ] Introduce shared API error/result helpers.
- [ ] Split `AcademicOperations.jsx` into feature modules.
- [ ] Remove the unused legacy `Quizzes` function from `AcademicOperations.jsx`.
- [ ] Add bounded cache and explicit mutation invalidation.

### Phase C — Pagination and database efficiency
- [ ] Add cursor/range pagination to users, notifications, materials, support, rosters, assignments, and submissions.
- [ ] Stop embedding all submissions inside broad assignment lists.
- [ ] Review indexes with `EXPLAIN (ANALYZE, BUFFERS)` against production-like data.
- [ ] Add archive/retention strategy for notifications, audit logs, and old attendance events.

### Phase D — Production security
- [ ] MFA for admin/owner.
- [ ] CAPTCHA/Turnstile for login and recovery.
- [ ] Admin audit log and sensitive-action reauthentication.
- [ ] Rate limit account creation, attendance check-in, quiz submission, support spam, and uploads.
- [ ] Rotate/remove legacy keys and isolate legacy deployment.
- [ ] Review admin session storage/BFF decision.

### Phase E — Testing and capacity
- [ ] Create staging data generator: 10k–30k students, 500–1,000 courses, realistic enrollments.
- [ ] Add integration/E2E tests for student/faculty/admin workflows.
- [ ] Add k6 load tests for login, dashboards, course open, attendance burst, quiz submit, assignment upload, and notification fan-out.
- [ ] Test 50 → 100 → 250 → 500 → 1,000 → 2,000 concurrent users.
- [ ] Record p50/p95/p99, errors, DB CPU, pool usage, and Realtime lag.
- [ ] Select Supabase/Realtime plan from evidence, not guesses.

## 11. Known risks and blockers

| Risk | Severity | Status / mitigation |
|---|---|---|
| Migrations may not all be applied | Critical | Confirm in target Supabase before feature testing |
| Too many requests on course/dashboard | High | Phase B read-model RPCs |
| Unbounded lists/nested submissions | High | Phase C pagination |
| No measured capacity | High | Phase E staging load tests |
| Admin session in SPA browser storage | Medium/High | strict CSP/RLS now; MFA + BFF decision before production |
| Direct Supabase API can bypass front-door CDN/WAF | Medium/High | RLS, Supabase rate controls, Edge Functions for expensive writes |
| Legacy keys/config remain in repository history | High | rotate and remove before production |
| Oversized `AcademicOperations.jsx` | Medium | split by feature in Phase B |
| Copilot review not yet returned | Low | re-request/check later |

## 12. Working method for multiple AI models

### At the start of every session

1. Read `AGENTS.md`.
2. Read this file completely.
3. Inspect the latest branch head and PR checks.
4. Identify one roadmap item and its dependencies.
5. Read only the relevant implementation/migration files.

### Before coding

Write a short internal plan with:
- scope;
- files likely affected;
- authorization impact;
- request-count impact;
- migration/deployment impact;
- verification plan.

### During coding

- Keep commits small and feature-focused.
- Do not combine unrelated UI, schema, and security changes without documenting them.
- Prefer extending an existing migration with a new numbered migration; never rewrite an already-applied migration.
- Never perform parallel updates to the same file from different agents.

### Before finishing

1. Run tests/build checks.
2. Check request count for changed screens.
3. Check RLS/server authorization, not only UI visibility.
4. Update the status, migration table, known risks, changelog, and next action here.
5. State manual deployment steps clearly.

### Handoff template

```text
Task:
Status: done | partial | blocked
Branch/head:
Files changed:
Migration/function changes:
Security decisions:
Request-count change:
Tests/checks:
Manual steps remaining:
Next recommended task:
```

## 13. Change log

- **2026-09-17 — Project memory:** added this canonical multi-agent context, guardrails, architecture target, request budgets, risks, and phased roadmap.
- **2026-09-16 — Account management:** added owner-aware administration, protected owner/self roles, and deployed `admin-create-user`.
- **2026-09-16 — Security hardening:** restricted support to owner/admin participants, limited notification updates, hardened assignment object writes.
- **2026-09-16 — Course workspace:** added per-course pages, theory/practical/general materials, and activity notifications.
- **2026-09-16 — Academic operations:** added assignments, quizzes, attendance, support, rosters, and administration flows.

## 14. Next recommended task

**Phase B.1: implement one summary RPC for the admin dashboard, replace the six browser count requests, record before/after request counts, and add a migration-level verification query.**
