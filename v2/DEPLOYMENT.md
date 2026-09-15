# Portal deployments

Create three Netlify sites from this repository and set the production branch to `rebuild/snu-portals-supabase` while testing.

All sites use:

- Base directory: `v2`
- Build command: `npm run test && npm run build`
- Publish directory: `dist`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (Supabase publishable key; never a secret/service-role key)

Set one portal scope per site:

- Student: `VITE_PORTAL_TYPE=student`
- Faculty: `VITE_PORTAL_TYPE=faculty`
- Admin: `VITE_PORTAL_TYPE=admin`

Do not publish or merge to `main` until the V2 review is complete.
