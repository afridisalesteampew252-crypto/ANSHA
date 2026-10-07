# Customer and staff password protection

The October 7 branch adds a shared server counter for admin and customer password sign-in. Both screens call `password-login`; three incorrect passwords within five minutes lock password sign-in for five minutes. Email case, another tab, clearing browser storage, and switching between the two screens do not bypass the gateway counter. Successful password verification clears prior failures. Network errors, email confirmation errors, and Auth request throttling do not count as wrong passwords. Concurrent requests reserve one attempt so they cannot race the counter.

The browser countdown mirrors the server response. It is a display aid; the private database table and service-only RPCs enforce the application gateway. Passwords and raw email addresses are never persisted in that table. Existing sessions and Google sign-in remain independent of this password cooldown.

## Activation and staging checks

1. Apply the reviewed branch migrations to a disposable/staging Supabase project, including `20261007040000_password_login_lockout.sql`.
2. Deploy `password-login` and `portal-password-reset`. Their `verify_jwt=false` entries are in `supabase/config.toml`: login has no existing session; reset verifies the JWT and active administrator role inside its handler. Supabase automatically provides the standard URL, anon key and service-role key to these functions. Do not expose the service-role key to Next.js client settings.
3. Check the project's subscription and hook availability before enabling the provider hook. Supabase's current [Auth hook availability table](https://supabase.com/docs/guides/auth/auth-hooks) lists Password Verification Attempt for Teams and Enterprise. The application gateway works independently; a Pro project must not be reported as protected against direct Auth API bypass until hook support is confirmed and tested. When available, in Supabase Dashboard → Authentication → Hooks → Password Verification Attempt, select the Postgres function `public.hook_password_login_lockout`. The migration grants schema usage and hook execution to `supabase_auth_admin`. This step is required to enforce the same cooldown on direct calls to Supabase Auth that bypass the app gateway. Merely applying the migration does not enable the Auth hook.
4. Auth → URL Configuration: allow `https://www.anshatradingco.com/auth/callback` and `https://www.anshatradingco.com/portal/reset-password` (plus the exact staging URLs being tested). For a staging Edge deployment, set `PUBLIC_SITE_URL` to the staging site origin; it defaults to the production canonical site.
5. Configure and verify the Auth recovery email delivery provider. Request a customer reset as an active admin and open the email in a separate customer browser. The server-created recovery link uses recovery tokens; `/portal/reset-password` imports them into the SSR client, removes the URL fragment, verifies active customer access, and requires matching new passwords. Self-service PKCE recovery exchanges its code at `/auth/callback?next=/portal/reset-password`.
6. Verify failure #1 and #2, failure #3 and its five-minute countdown, a new browser during the lock, a direct Auth API request during the lock, expiry, and success clearing earlier failures. Run `npm run test:unit` and `tests/database/password-lockout.test.sql` in the disposable database suite.

No production hook, migrations, or Edge deployment are activated by these code changes.

## Deployment order and API settings

Apply the reviewed migrations first. Then deploy both Edge functions before publishing the website revision that uses the login gateway:

```sh
supabase functions deploy password-login --project-ref PROJECT_REF --no-verify-jwt --use-api
supabase functions deploy portal-password-reset --project-ref PROJECT_REF --no-verify-jwt --use-api
```

Run from the repository root with an authenticated Supabase CLI or a securely supplied `SUPABASE_ACCESS_TOKEN`. `--use-api` uses server bundling and avoids a local Docker dependency. Both deployed functions must report `verify_jwt=false`. Their handlers use Supabase's automatically supplied `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The production `PUBLIC_SITE_URL` value, if set, must be `https://www.anshatradingco.com` without a trailing slash.

Preserve existing Auth redirect entries and add both recovery targets. Set `site_url` to `https://www.anshatradingco.com`. `uri_allow_list` is a comma-separated string and must include `https://www.anshatradingco.com/auth/callback` and `https://www.anshatradingco.com/portal/reset-password`. Self-service PKCE adds `?next=/portal/reset-password` to the callback; confirm a generated recovery link retains that destination.

Recovery templates should link to `{{ .ConfirmationURL }}`, which lets Auth select PKCE or server-created recovery correctly and preserve the intended redirect. A custom template that points directly to `/auth/callback` with `token_hash` is unsupported by this callback, which expects a PKCE `code`. Custom SMTP must be configured for customer email delivery: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email` and `smtp_sender_name`. Preserve existing valid SMTP credentials and sender settings. The default Supabase email service restricts recipient addresses and is not evidence that arbitrary customers can receive recovery email. SMTP acceptance and actual inbox delivery still require a real test.

When the subscription supports Password Verification Attempt, the Management API endpoint `PATCH /v1/projects/PROJECT_REF/config/auth` accepts:

```json
{
  "hook_password_verification_attempt_enabled": true,
  "hook_password_verification_attempt_uri": "pg-functions://postgres/public/hook_password_login_lockout"
}
```

A Postgres hook does not require an HTTP signing secret. Confirm the two values using `GET /v1/projects/PROJECT_REF/config/auth`, and verify DB grants before activation:

```sql
SELECT
  to_regprocedure('public.hook_password_login_lockout(jsonb)') IS NOT NULL AS hook_exists,
  has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') AS auth_schema_usage,
  has_function_privilege('supabase_auth_admin', 'public.hook_password_login_lockout(jsonb)', 'EXECUTE') AS auth_hook_execute,
  NOT has_function_privilege('anon', 'public.hook_password_login_lockout(jsonb)', 'EXECUTE') AS anon_cannot_forge_hook,
  NOT has_function_privilege('authenticated', 'public.hook_password_login_lockout(jsonb)', 'EXECUTE') AS users_cannot_forge_hook;
```

Publish the website only after its backend prerequisites are ready. After the website is available, test gateway login and customer recovery, then verify the provider hook on a dedicated test account. Use isolated regression accounts for failure/lockout tests rather than deliberately locking a real administrator account.

## Customer reset and assignment permissions

An active account administrator can request a customer password reset from the account page. The Edge function selects the active linked Auth user itself, uses Auth's current email, and records `customer_password_reset_requested` through a DB function that checks the administrator role again. The audit records the request, not a delivery guarantee. General staff and managers cannot trigger this administrator action. Customers retain public self-service recovery for their own email.

Customer assignment uses the audited `assign_customer_owner` RPC. Admins can assign, reassign, or remove any valid owner and undo the most recent UI assignment. Undo compares the expected current owner under a row lock so a later reassignment is preserved. Managers can reassign only customers currently assigned to them; transferring or unassigning the customer removes it from their scoped list, and an administrator can restore it. The UI warns before a manager transfers ownership.
