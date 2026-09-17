# Cloudflare deployment

## How builds start

Cloudflare watches `rebuild/snu-portals-supabase`. Every pushed commit starts a build automatically. From Root directory `v2`, Cloudflare runs:

```text
Install: npm ci
Build: npm run test && npm run build
Deploy: project-specific Wrangler command
```

Vite embeds `VITE_*` variables during the build, so changing variables requires a new deployment.

## Combined verification project

Current project: `snu-web`

- Deploy: `npx wrangler deploy`
- Config: `wrangler.jsonc`
- `VITE_PORTAL_TYPE=all`

Keep temporarily while separate portals are verified.

## Student project

Project: `snu-student`

- Branch: `rebuild/snu-portals-supabase`
- Root: `v2`
- Build: `npm run test && npm run build`
- Deploy: `npx wrangler deploy --config wrangler.student.jsonc`
- Preview: `npx wrangler versions upload --config wrangler.student.jsonc`
- Variables: Node 22, Supabase URL, publishable anon key, `VITE_PORTAL_TYPE=student`

Current status:
- [x] Project created and branch/root/commands configured.
- [x] Owner reported all four build variables configured.
- [ ] Current deployment verification in progress.

## Remaining projects

### Faculty
- Name: `snu-faculty`
- Deploy: `npx wrangler deploy --config wrangler.faculty.jsonc`
- Preview: `npx wrangler versions upload --config wrangler.faculty.jsonc`
- `VITE_PORTAL_TYPE=faculty`

### Admin
- Name: `snu-admin`
- Deploy: `npx wrangler deploy --config wrangler.admin.jsonc`
- Preview: `npx wrangler versions upload --config wrangler.admin.jsonc`
- `VITE_PORTAL_TYPE=admin`

After all three URLs work, add them to Supabase Auth Redirect URLs, attach custom domains, and keep Netlify/combined Worker for 48 hours as rollback.
