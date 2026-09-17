# Portal deployments

## Target hosting: Cloudflare Pages

Netlify is now a temporary fallback only. The production target is three Cloudflare Pages projects, preferably on custom subdomains so the platform does not depend on a shared provider domain.

Follow `CLOUDFLARE_DEPLOYMENT.md` for the exact setup.

All portal projects use:

- Repository: `Tareq612345/snu_web`
- Production branch while testing: `rebuild/snu-portals-supabase`
- Root directory: `v2`
- Build command: `npm run test && npm run build`
- Build output directory: `dist`
- `NODE_VERSION=22`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable/anon key only)

Portal scope:

- Student: `VITE_PORTAL_TYPE=student`
- Faculty: `VITE_PORTAL_TYPE=faculty`
- Admin: `VITE_PORTAL_TYPE=admin`

Vite embeds `VITE_*` values at build time, so environment changes require a new deployment. Never configure a service-role key in Cloudflare, Vite, GitHub, or browser code.

Do not merge to `main` until V2 review, migrations, and role tests are complete.
