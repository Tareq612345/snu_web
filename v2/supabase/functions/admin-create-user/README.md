# admin-create-user

Secure server-side account provisioning for the V2 admin portal.

Deploy after applying migrations through `012`:

```bash
supabase functions deploy admin-create-user
```

The function uses Supabase-provided server environment variables. Never copy `SUPABASE_SERVICE_ROLE_KEY` into Vite, Netlify, GitHub, or browser code.

Authorization rules:
- Active admins may create students and faculty accounts.
- Only a row in `platform_owners` may create another admin.
- The owner account cannot be demoted or disabled through the portal.
