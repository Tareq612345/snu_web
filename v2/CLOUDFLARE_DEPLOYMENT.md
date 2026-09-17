# Cloudflare deployment — current setup

The Cloudflare project `snu-web` is a Worker with Static Assets. Static asset requests remain free/unlimited.

## Required build settings

Open `snu-web` → **Settings** → **Builds** and set:

- Production branch: `rebuild/snu-portals-supabase`
- Root directory: `v2`
- Build command: `npm run test && npm run build`
- Deploy command: `npx wrangler deploy`
- Preview deploy command: `npx wrangler versions upload`

Environment variables:

- `NODE_VERSION=22`
- `VITE_SUPABASE_URL=<project URL>`
- `VITE_SUPABASE_ANON_KEY=<publishable anon key>`
- `VITE_PORTAL_TYPE=all` for the first combined verification deployment

`v2/wrangler.jsonc` deploys `dist` and sets `assets.not_found_handling` to `single-page-application`. Therefore `public/_redirects` must not contain Netlify's `/* /index.html 200` rule; Cloudflare Workers detects that rule as an infinite loop. The file is now comment-only and Wrangler owns SPA fallback.

## Diagnosed build failures

1. Cloudflare initially built the repository root and found legacy Vite `5.4.21`; fixed by Root directory `v2`.
2. `npm ci` initially failed because V2 lacked `package-lock.json`; fixed by committing the V2 lockfile.
3. Worker asset deployment rejected Netlify's `_redirects` SPA rule as an infinite loop; fixed by using only `wrangler.jsonc` SPA fallback.

## After the combined deployment works

Create separate projects for student, faculty, and admin with portal type `student`, `faculty`, or `admin`. Use owned subdomains for production and update Supabase Auth Site/Redirect URLs. Keep Netlify for 48 hours as rollback before disabling it.
