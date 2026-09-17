# Cloudflare Pages migration

Cloudflare Pages is the recommended Netlify replacement for the V2 static portals. Static asset requests are free and unlimited; the Free plan currently allows 500 builds/month and 100 custom domains per project. Pages Functions/Workers have separate quotas, but these portals call Supabase directly and do not require Pages Functions.

## Why three projects

Use one project per portal to keep route bundles and environment scope separated:

1. `snu-student-portal`
2. `snu-faculty-portal`
3. `snu-admin-portal`

A single GitHub repository and branch can power all three.

## Create each project

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorize GitHub and select `Tareq612345/snu_web`.
4. Set production branch to `rebuild/snu-portals-supabase` while V2 is under review.
5. Configure:
   - Framework preset: `Vite`
   - Root directory: `v2`
   - Build command: `npm run test && npm run build`
   - Build output directory: `dist`
6. Add environment variables for both Production and Preview:
   - `NODE_VERSION=22`
   - `VITE_SUPABASE_URL=<Supabase Project URL>`
   - `VITE_SUPABASE_ANON_KEY=<publishable anon key>`
   - `VITE_PORTAL_TYPE=student` or `faculty` or `admin`
7. Save and deploy.

Repeat for all three portal types.

## SPA routing and security headers

The repository already contains compatible files:

- `public/_redirects`: sends React routes to `/index.html`.
- `public/_headers`: CSP, HSTS, framing, referrer, permission, and cache controls.

Do not add a top-level `404.html` inside `v2/public`; Cloudflare Pages then keeps SPA fallback behavior.

## Custom domains — strongly recommended

Do not rely permanently on `*.pages.dev` or any shared hosting domain. Attach owned subdomains:

- `student.<your-domain>`
- `faculty.<your-domain>`
- `admin.<your-domain>`

In each Pages project: **Custom domains** → **Set up a domain**. A custom domain is the real mitigation for shared-provider-domain blocking.

## Supabase Auth URLs

After Cloudflare deployment, open Supabase:

**Authentication → URL Configuration**

- Set the final production Site URL.
- Add every student/faculty/admin Cloudflare custom domain and required preview URL pattern to Redirect URLs.
- Remove Netlify URLs only after Cloudflare login, password recovery, and email links are verified.

## Cutover checklist

- [ ] All three Cloudflare deployments build successfully.
- [ ] Direct route refresh works, e.g. `/student/courses`.
- [ ] CSP allows Supabase HTTPS and WebSocket traffic.
- [ ] Student login/logout/recovery works.
- [ ] Faculty login and upload works.
- [ ] Admin login and `admin-create-user` works.
- [ ] Supabase redirect URLs are updated.
- [ ] Custom subdomains are active with HTTPS.
- [ ] DNS cutover is complete.
- [ ] Netlify remains available for 48 hours as rollback.
- [ ] Netlify is disabled only after verification.

## Important quota distinction

Cloudflare serving the Vite files does not consume Supabase requests. Database/Auth/Realtime quotas still belong to the Supabase project. Moving hosting solves the shared Netlify domain and static-hosting limits; reducing application requests and selecting the correct Supabase plan remain separate architecture work.
