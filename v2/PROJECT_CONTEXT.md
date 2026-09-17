# SNU University Platform V2 — Canonical Project Context

> Persistent project memory for every AI model and human contributor. Read before changes; update in the same commit as meaningful work.

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
| Target hosting | **Cloudflare Pages**, three portal projects, custom domains recommended |
| Old hosting | Netlify; temporary rollback only after Cloudflare cutover |
| Supabase project ref | `ixqpqognqifeemeamnbm` |

## 2. Non-negotiable rules

- Never edit or merge `main` without explicit owner approval.
- Never treat the legacy root as active implementation.
- Never expose service-role keys, tokens, passwords, or DB passwords.
- UI checks are not authorization; use RLS/functions.
- Never fetch unbounded tables or deeply nested unbounded relations.
- Never claim a migration/deployment is applied without evidence.
- Update this file in the same commit as meaningful changes.
- Every feature needs authorization, loading/error/empty states, and verification.

## 3. Roles

- **Student:** active-enrollment content and own submissions/attempts/attendance/support.
- **Faculty:** assigned courses/rosters; no platform support access.
- **Admin:** academic/user/support management; cannot change own role or disable self.
- **Owner:** `platform_owners`; cannot be demoted/disabled; may create admins.

## 4. Architecture

### Data access
- Simple bounded CRUD: Supabase client + RLS.
- Aggregates/read models/atomic workflows: PostgreSQL RPC.
- Privileged Auth/admin actions: Supabase Edge Functions.
- Files: private Storage + signed URLs + RLS.
- Realtime: notifications/deltas only.

### Target frontend structure

```text
src/
├── app/
├── features/            # auth, users, courses, materials, assignments, quizzes, attendance, announcements, notifications, support
├── shared/              # api, components, hooks, validation, errors, utils
└── pages/               # thin route composition
```

### Current hotspots
- Course workspace: 6 requests; target 1 RPC.
- Admin dashboard: fixed by `013`; 6 counts → 1 RPC.
- Lists request 100–500 rows without real pagination.
- Broad assignment queries can embed every submission.
- `AcademicOperations.jsx` is oversized with unused quiz code.

## 5. Request budget

| Flow | Current | Target |
|---|---:|---:|
| Authenticated bootstrap | session + profile | max 2 network requests |
| Admin dashboard | 1 RPC after `013` | 1 |
| Course workspace | 6 | 1 RPC + optional paginated detail |
| Lists | 100–500 rows | 25 rows/page |
| Repeated navigation | refetches | bounded cache + invalidation |

Targets: read p95 `<500ms`, write p95 `<1s` excluding uploads, errors `<1%`, DB CPU `<70%`, pool `<70–80%`, notification lag `<2s`. Capacity is unproven until load testing.

## 6. Authentication/security

- SPA uses PKCE, automatic refresh, persistent Supabase sessions, JWT + RLS, and strict CSP.
- No service-role key exists in V2 browser code.
- Student/faculty may remain SPA. Decide admin BFF/SSR HttpOnly-cookie architecture before production.

Required:
- [ ] MFA for owner/admins.
- [ ] CAPTCHA/Turnstile for login/recovery.
- [ ] Session/inactivity policy and sensitive-action reauth.
- [ ] Admin audit log and rate limits.
- [ ] Rotate/remove legacy exposed keys.
- [ ] WAF/custom-domain plan.

## 7. Hosting

### Decision
- [x] Select Cloudflare Pages as Netlify replacement.
- [x] Add `CLOUDFLARE_DEPLOYMENT.md` and compatible build configuration.
- [ ] Create student Cloudflare Pages project.
- [ ] Create faculty Cloudflare Pages project.
- [ ] Create admin Cloudflare Pages project.
- [ ] Add custom subdomains and HTTPS.
- [ ] Update Supabase Auth Site/Redirect URLs.
- [ ] Run role and route-refresh smoke tests.
- [ ] Keep Netlify 48 hours for rollback, then disable.

Static asset requests are free/unlimited on Cloudflare. Pages/Workers dynamic function limits are separate. Supabase Auth/DB/Realtime quotas remain unchanged by this move.

## 8. Migrations

| Migration | Purpose | Repository | Applied |
|---|---|---:|---:|
| `001`–`007` | base schema, RLS, storage, levels | ✅ | confirm environment |
| `008` | academic operations | ✅ | confirm environment |
| `009` | roster + notifications | ✅ | confirm environment |
| `010` | tracks + activity notifications | ✅ | confirm environment |
| `011` | support/write hardening | ✅ | confirm environment |
| `012` | owner + accounts | ✅ | confirm environment |
| `013` | one-request admin dashboard | ✅ | must be applied |

Run in order; never rewrite/re-run applied migrations blindly.

## 9. Edge Functions

| Function | Purpose | Code | Deployment |
|---|---|---:|---:|
| `admin-create-user` | secured Auth user creation | ✅ | ✅ deployed to `ixqpqognqifeemeamnbm` on 2026-09-16 |

## 10. Completed work

- [x] Separate role builds, PKCE, active-profile guards, RLS, private storage, CSP.
- [x] Owner-aware account management and account Edge Function.
- [x] Courses, structure, enrollments, teaching assignments, course workspace, material tracks.
- [x] Announcements, assignments, grading, quizzes, attendance, notifications, support.
- [x] Canonical multi-agent instructions/context.
- [x] Admin dashboard 6 requests → 1 RPC.
- [x] Cloudflare Pages migration plan prepared.
- [ ] Confirm migrations through `013`.
- [ ] Real-account E2E testing.
- [ ] Merge to `main` — blocked.

## 11. Roadmap

### Phase A — memory/guardrails
- [x] Context and AI instruction files.

### Phase B — requests/features
- [x] Admin summary RPC.
- [ ] Course workspace RPC.
- [ ] Shared API helpers.
- [ ] Split `AcademicOperations.jsx`; remove unused quizzes.
- [ ] Bounded cache + invalidation.

### Phase C — pagination/database
- [ ] Paginate users, notifications, materials, support, rosters, assignments, submissions.
- [ ] Stop broad nested submission loading.
- [ ] Review indexes with `EXPLAIN` on realistic data.
- [ ] Retention/archive policy.

### Phase D — production security
- [ ] MFA, CAPTCHA, audit log, reauth, rate limits.
- [ ] Rotate legacy keys.
- [ ] Decide admin BFF vs hardened SPA.

### Phase E — capacity
- [ ] Staging data: 10k–30k students, 500–1,000 courses.
- [ ] E2E/integration/k6 tests.
- [ ] Test 50→2,000 concurrent users and record p50/p95/p99/errors/CPU/pool/Realtime lag.
- [ ] Choose Supabase plan from evidence.

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Migrations not confirmed | Critical | verify Supabase |
| Six course requests | High | next RPC |
| Unbounded lists | High | pagination |
| No capacity evidence | High | load tests |
| Shared provider domains can be blocked | High | owned custom domains on Cloudflare |
| Admin SPA session | Medium/High | CSP/RLS now; MFA+BFF decision |
| Direct Supabase API bypasses front-door WAF | Medium/High | RLS, platform controls, Edge Functions |
| Legacy keys | High | rotate/remove |

## 13. Multi-model workflow

Start: read root `AGENTS.md` and this file, inspect branch/checks, select one roadmap item, read relevant files. During work: small commits, no duplicate routes/functions/migrations, no simultaneous edits to one file. Finish: verify checks/request count/RLS, update this file, state manual steps.

Handoff:

```text
Task:
Status:
Branch/head:
Files changed:
Migration/function changes:
Security decisions:
Request-count change:
Tests/checks:
Manual steps remaining:
Next task:
```

## 14. Change log

- **2026-09-17 — Hosting:** selected Cloudflare Pages, documented three-project migration, custom domains, Auth URL cutover, and rollback.
- **2026-09-17 — Dashboard:** added `013`; six counts → one authorized RPC.
- **2026-09-17 — Project memory:** context, guardrails, request budgets, multi-agent instructions.
- **2026-09-16 — Accounts/security:** owner protection, account Edge Function, support/notification/submission hardening.

## 15. Next recommended task

Create the three Cloudflare Pages projects and custom subdomains, then continue Phase B.2 (`get_course_workspace`: 6 requests → 1).
