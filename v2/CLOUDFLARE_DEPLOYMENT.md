# Cloudflare deployment

## How builds start

Cloudflare watches the production branch `rebuild/snu-portals-supabase`. Every successful `git push` that adds a commit starts a build automatically. Cloudflare runs from Root directory `v2`:

```text
Install: npm ci
Build: npm run test && npm run build
Deploy: npx wrangler deploy [portal config]
```

Vite embeds `VITE_*` variables during the build, so changing a variable requires a new deployment. A harmless documentation commit can trigger a rebuild, but normal development commits should be used instead.

## Combined verification project

Current project: `snu-web`

- Deploy command: `npx wrangler deploy`
- Config: `wrangler.jsonc`
- `VITE_PORTAL_TYPE=all`

Keep it temporarily while role-specific projects are verified.

## Separate production projects

Create three Cloudflare Workers connected to the same repository and branch. All use:

- Branch: `rebuild/snu-portals-supabase`
- Root directory: `v2`
- Build command: `npm run test && npm run build`
- Preview command: same config as production, using `wrangler versions upload --config ...`
- Build variables: `NODE_VERSION=22`, Supabase URL, publishable anon key.

### Student

- Project name: `snu-student`
- Deploy: `npx wrangler deploy --config wrangler.student.jsonc`
- Preview: `npx wrangler versions upload --config wrangler.student.jsonc`
- `VITE_PORTAL_TYPE=student`

### Faculty

- Project name: `snu-faculty`
- Deploy: `npx wrangler deploy --config wrangler.faculty.jsonc`
- Preview: `npx wrangler versions upload --config wrangler.faculty.jsonc`
- `VITE_PORTAL_TYPE=faculty`

### Admin

- Project name: `snu-admin`
- Deploy: `npx wrangler deploy --config wrangler.admin.jsonc`
- Preview: `npx wrangler versions upload --config wrangler.admin.jsonc`
- `VITE_PORTAL_TYPE=admin`

The Wrangler `name` must match the Cloudflare project name. Static assets are served from `dist`, and SPA fallback is configured in each Wrangler file.

## Supabase/Auth cutover

After all three URLs work, add them to Supabase Authentication Redirect URLs. Then attach owned custom subdomains and keep Netlify plus `snu-web` for 48 hours as rollback before disabling them.
