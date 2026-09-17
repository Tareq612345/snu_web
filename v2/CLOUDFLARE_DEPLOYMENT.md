# Cloudflare deployment — current setup

The current Cloudflare project `snu-web` was created as a **Worker with Static Assets**. That is acceptable and static asset requests remain free/unlimited.

## Required build settings

Open `snu-web` → **Settings** → **Builds**.

Set:

- Production branch: `rebuild/snu-portals-supabase`
- Root directory: `v2`
- Build command: `npm run test && npm run build`
- Deploy command: `npx wrangler deploy`
- Preview deploy command: `npx wrangler versions upload`

Environment variables:

- `NODE_VERSION=22`
- `VITE_SUPABASE_URL=<project URL>`
- `VITE_SUPABASE_ANON_KEY=<publishable anon key>`
- `VITE_PORTAL_TYPE=all` for this first combined verification deployment

The repository contains `v2/wrangler.jsonc`, which deploys `dist` and provides React SPA fallback routing.

## Why the first build failed

Cloudflare built the repository root, where the legacy application uses Vite `5.4.21`. The V2 app is under `v2/` and uses Vite `8.3.0`. Selecting Root directory `v2` prevents legacy dependencies from entering the build.

## After the combined deployment works

Create separate Workers/Pages projects for student, faculty, and admin. Each uses the same branch/root/build settings, with portal type `student`, `faculty`, or `admin`. Give each project a matching Wrangler name/config or override the deploy name in project settings.

## Custom domains

Use owned subdomains for production: `student.<domain>`, `faculty.<domain>`, `admin.<domain>`. Update Supabase Auth Site URL and Redirect URLs after domains are active. Keep Netlify for 48 hours as rollback, then disable it.
