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
| Current documented head | this file must be refreshed after each commit |

## 2. Non-negotiable rules

- Never edit or merge `main` without explicit owner approval.
- Never treat the legacy root as the active implementation.
- Never put service-role keys, tokens, passwords, or DB passwords in Vite, Netlify, GitHub, browser code, logs, screenshots, or chat.
- Never trust UI role checks alone; enforce access with RLS/functions.
- Never fetch unbounded tables or deeply nested unbounded relations.
- Never claim a migration is applied without SQL/CLI/dashboard evidence.
- Every meaningful commit must update this file.
- Every feature must include authorization, loading/error/empty states, and verification.

## 3. Roles and trust model

- **Student:** active-enrollment content, own submissions/attempts/attendance/support only.
- **Faculty:** assigned courses and rosters; publishes and grades only assigned courses; no platform support access.
- **Admin:** academic/user/support management; cannot change own role or disable self.
- **Platform owner:** stored in `platform_owners`; cannot be demoted/disabled; may create other admins.

## 4. Architecture decision

### Data access
- Simple bounded CRUD: Supabase client + RLS.
- Aggregates, multi-table read models, atomic workflows: PostgreSQL RPC.
- Privileged Auth/admin operations: Edge Functions.
- Files: private Storage + signed URLs + RLS.
- Realtime: notifications/deltas only, not bulk reads.

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
├── shared/              # api, components, hooks, validation, errors, utils
└── pages/               # thin route composition only
```

### Current hotspots
- Course workspace: 6 parallel requests; target 1 read-model RPC.
- Admin dashboard: **fixed in migration `013`**; 6 count requests replaced by 1 RPC.
- Lists request 100–500 rows without real pagination.
- Broad assignment queries can embed every submission.
- `AcademicOperations.jsx` is oversized and contains unused legacy quiz code.

## 5. Request budget

| Flow | Current | Target |
|---|---:|---:|
| Authenticated bootstrap | session + profile | maximum 2 network requests |
| Admin dashboard | **1 summary RPC after `013`** | 1 |
| Course workspace shell | 6 | 1 read-model RPC + optional paginated detail |
| Lists | 100–500 rows | 25 rows/page |
| Repeated navigation | refetches | bounded cache + explicit invalidation |

Performance targets: read p95 `<500ms`, write p95 `<1s` excluding uploads, errors `<1%`, DB CPU `<70%`, pool `<70–80%`, notification lag `<2s`. Capacity remains unproven until staging load tests.

## 6. Authentication and browser security

- SPA uses PKCE, automatic refresh, and persistent Supabase sessions.
- JWT + RLS is the data authorization boundary.
- Strict CSP is enabled; no service-role key exists in V2 browser code.
- Student/faculty may remain SPA. Before production, decide whether admin moves to BFF/SSR HttpOnly cookies.
- Cookie architecture requires server session handling and CSRF protection; do not switch casually.

Required before production:
- [ ] MFA for owner/admins.
- [ ] CAPTCHA/Turnstile for login/recovery.
- [ ] Session/inactivity policy and sensitive-action reauthentication.
- [ ] Admin audit log.
- [ ] Rate limiting for privileged/expensive actions.
- [ ] Rotate/remove legacy exposed third-party keys.
- [ ] WAF/custom-domain plan.

## 7. Migrations

| Migration | Purpose | Repository | Applied |
|---|---|---:|---:|
| `001`–`007` | base schema, RLS, storage, levels | ✅ | Needs environment confirmation |
| `008` | academic operations | ✅ | Needs environment confirmation |
| `009` | roster + notifications | ✅ | Needs environment confirmation |
| `010` | course tracks + activity notifications | ✅ | Needs environment confirmation |
| `011` | support/write hardening | ✅ | Needs environment confirmation |
| `012` | owner + account management | ✅ | Needs environment confirmation |
| `013` | one-request admin dashboard read model | ✅ | **Must be applied** |

Migrations run in numeric order. Do not rewrite/re-run old applied migrations blindly.

## 8. Edge Functions

| Function | Purpose | Code | Deployment |
|---|---|---:|---:|
| `admin-create-user` | server-side user creation with owner/admin checks | ✅ | ✅ deployed to `ixqpqognqifeemeamnbm` on 2026-09-16 |

Successful deployment command:

```bash
npx supabase functions deploy admin-create-user --use-api
```

## 9. Completed work

- [x] Separate student/faculty/admin V2 builds.
- [x] PKCE and active-profile guards.
- [x] RLS, secure helper functions, private storage, CSP.
- [x] Owner-aware user management and server-side account creation.
- [x] Courses, academic structure, enrollments, teaching assignments.
- [x] Per-course workspace and theory/practical/general materials.
- [x] Announcements, assignments, grading, quizzes, attendance, notifications, support.
- [x] Canonical multi-agent context and instruction files.
- [x] Admin dashboard reduced from six browser requests to one summary RPC (`013`).
- [ ] Confirm migrations through `013` in the target database.
- [ ] Real-account E2E testing for all roles.
- [ ] Merge to `main` — blocked until explicit approval/readiness.

## 10. Roadmap

### Phase A — Project memory and guardrails
- [x] Canonical project context.
- [x] `AGENTS.md`, `CLAUDE.md`, Copilot instructions.
- [x] Request budgets and target architecture.

### Phase B — Reduce requests and split features
- [x] `get_admin_dashboard_summary` RPC; 6 → 1 browser request.
- [ ] `get_course_workspace` RPC; 6 → 1 request.
- [ ] Shared API error/result helpers.
- [ ] Split `AcademicOperations.jsx` by feature.
- [ ] Remove unused legacy `Quizzes` implementation.
- [ ] Bounded query cache + mutation invalidation.

### Phase C — Pagination/database efficiency
- [ ] Pagination for users, notifications, materials, support, rosters, assignments, submissions.
- [ ] Stop embedding all submissions in broad assignment lists.
- [ ] Review indexes with `EXPLAIN (ANALYZE, BUFFERS)` on production-like data.
- [ ] Retention/archive policy for notifications, audit logs, attendance.

### Phase D — Production security
- [ ] MFA, CAPTCHA, audit logs, sensitive-action reauth.
- [ ] Rate limits: account creation, attendance, quizzes, support, uploads.
- [ ] Rotate/remove legacy keys and isolate legacy deployment.
- [ ] Decide admin BFF/SSR vs hardened SPA.

### Phase E — Capacity testing
- [ ] Staging generator: 10k–30k students, 500–1,000 courses.
- [ ] Integration/E2E tests.
- [ ] k6 tests: login, dashboard, course open, attendance burst, quiz submit, upload, notification fan-out.
- [ ] Test 50 → 100 → 250 → 500 → 1,000 → 2,000 concurrent users.
- [ ] Record p50/p95/p99, errors, CPU, pool usage, Realtime lag.
- [ ] Choose Supabase plan from evidence.

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Migrations not confirmed applied | Critical | verify target Supabase |
| Six course requests | High | next: course read-model RPC |
| Unbounded lists/nested submissions | High | pagination phase |
| No measured capacity | High | staging load tests |
| Admin session in SPA storage | Medium/High | CSP/RLS now; MFA+BFF decision |
| Direct Supabase API bypasses front-door WAF | Medium/High | RLS, Supabase controls, Edge Functions |
| Legacy keys/config remain | High | rotate/remove before production |
| Oversized operations file | Medium | split by feature |

## 12. Multi-model workflow

### Start
1. Read root `AGENTS.md` and this file.
2. Inspect latest branch head and PR checks.
3. Select one roadmap item and read only relevant files.
4. Record authorization/request/migration impact before coding.

### During work
- Small feature-focused commits.
- Do not duplicate routes, pages, policies, functions, or migrations.
- New migration number only; do not rewrite an already-applied migration.
- Never let two agents update the same file in parallel.

### Finish
1. Verify code/build/checks.
2. Measure request count for changed screen.
3. Verify server/RLS authorization.
4. Update this file in the same commit.
5. State manual deployment steps.

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

- **2026-09-17 — Admin dashboard performance:** added `013`, moved dashboard to a dedicated lazy page, consolidated six counts into one authorized RPC.
- **2026-09-17 — Project memory:** added canonical context, guardrails, request budgets, risks, and multi-agent instructions.
- **2026-09-16 — Account management:** owner protection and deployed `admin-create-user`.
- **2026-09-16 — Security:** support/notification/submission hardening.
- **2026-09-16 — Course workspace:** course pages, material tracks, activity notifications.

## 14. Next recommended task

**Phase B.2: implement `get_course_workspace`, replace the six course requests with one authorized read-model RPC, and record before/after request counts.**
