# Klipp RBAC — staging validation runbook

This runbook is for validating migrations 013/014 and the matching admin UI in a **future disposable Supabase staging project or isolated database branch**. It is not permission to apply migrations to production.

## Safety boundary

- Do not run this against production.
- Never use `main`; the code under test is `security/013-super-admin-rbac`.
- Take a database backup or create a disposable database branch before applying anything.
- Use dedicated test users and synthetic verification documents. Never use real customer/professional documents.
- The migration preflight expects exactly one `admin@admin.com` profile with role `admin`.
- The migrations have already been applied to Klipp's only connected Supabase project. Do not re-run them there.
- The only connected project was not a disposable staging environment. Real browser/native regression and real Storage access tests remain outstanding.

## 1. Environment identity and schema preflight (read-only)

Run these queries first in the intended staging SQL editor. Stop if the project reference, environment, owner account, or schema is not what you expect.

```sql
select current_database() as database_name,
       current_user as database_user,
       current_setting('server_version') as postgres_version;

select u.id, u.email, p.role
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('admin@admin.com');

select to_regclass('public.platform_settings') as platform_settings,
       to_regclass('public.profiles') as profiles,
       to_regclass('storage.objects') as storage_objects;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'platform_settings')
order by table_name, ordinal_position;
```

Expected owner precondition: exactly one matching profile and its role is `admin`. Do not modify the profile to force the precondition; investigate the staging identity first.

## 2. Apply only in disposable staging

After reviewing the preflight output and obtaining explicit approval for the staging target:

1. Apply `013_super_admin_rbac_foundation.sql` to the disposable staging database.
2. Inspect the created owner identity and permission catalog.
3. Apply `014_staff_rbac_enforcement_and_management.sql`.
4. Stop on any SQL error. Do not retry partially applied statements manually; inspect transaction state and migration history first.

## 3. Post-migration structural checks (read-only)

```sql
select * from public.platform_owner;

select code, description, sensitive
from public.staff_permissions
order by code;

select template_key, name, description
from public.staff_role_templates
order by template_key;

select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'is_super_admin',
    'has_admin_permission',
    'admin_list_accounts',
    'admin_set_user_role',
    'admin_review_professional',
    'admin_get_platform_settings',
    'admin_update_platform_settings',
    'admin_list_staff_access',
    'admin_list_staff_templates',
    'admin_set_staff_template',
    'admin_set_staff_permission',
    'admin_revoke_staff_access',
    'admin_list_audit_log'
  )
order by routine_name;

select policyname, tablename, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by tablename, policyname;
```

Verify that the owner singleton contains only the expected owner profile, all required permission keys/templates exist, and the RPCs/policies are installed.

## 4. Role and permission test matrix

Use separate authenticated browser sessions for the owner, a restricted employee, a professional test user, a client test user, and an unrelated user. Do not impersonate users by editing JWT claims manually in a production environment.

| Scenario | Expected result |
|---|---|
| Owner calls `is_super_admin()` | true |
| Employee calls `is_super_admin()` | false |
| Owner calls `has_admin_permission(any_known_key)` | true |
| Employee with a template grant checks that permission | true |
| Employee with explicit deny checks that permission | false |
| Owner clears an override | template result applies again |
| Non-admin client/pro calls admin permission resolver | false |
| Employee without `accounts.read` or `verification.review` lists accounts | denied |
| Verification-only employee lists accounts | only professional accounts returned |
| Verification-only employee reads verification metadata | allowed only where required by review flow |
| Employee without `verification.review` opens another user's private verification document | denied |
| Document owner opens their own verification document | allowed under the existing owner policy |
| Unrelated user opens that document | denied |
| Employee tries to grant/revoke admin | denied |
| Employee tries to change critical commission/request-expiry settings | denied |
| Employee with `settings.operational` reads settings | empty object while only critical keys exist |
| Owner reads/updates critical settings within allowed bounds | allowed |
| Employee without `catalog.manage` mutates catalog | denied |
| Employee with `catalog.manage` mutates a synthetic staging catalog record | allowed |
| Owner revokes a test employee's admin access | allowed; subsequent staff RPCs denied |
| Staff assignment/revocation actions | audit events visible to owner |

For the account-list data-minimization test, inspect the returned JSON and confirm that verification document paths/metadata are absent for callers without `verification.review`. Do not rely only on whether the UI hides a field.

For critical settings, inspect the raw RPC response as the employee, not only the rendered UI. Confirm commission and request-expiry values are absent.

## 5. UI regression checks

Deploy the matching app branch to a staging build only after the database tests pass.

- Owner sees the full admin navigation and **Equipo y permisos**.
- Restricted employees see only their authorized sections.
- Verification-only employee can review professional applications but cannot manage client accounts or staff.
- Owner can assign each template, set allow/deny overrides, clear overrides, and revoke a disposable test employee.
- A revoked employee loses admin access after session refresh/re-authentication.
- Owner sees the latest audit entries; employees cannot call the audit RPC.
- Critical settings are visible/editable only to owner and require confirmation.
- Existing client/professional registration, bookings, professional verification and catalog screens still work.
- Test web and native layouts separately.

## 6. Evidence to record

Record the staging project reference (never secrets), migration versions and timestamps, test-user roles, each scenario's pass/fail result, relevant sanitized RPC responses, and screenshots of owner/employee UI. Do not include access tokens, service-role keys, passwords, OTPs, private documents, or personal customer data.

## 7. Exit criteria

Do not promote this work from staging until:
- All SQL migrations apply cleanly to disposable staging.
- Every authorization/data-minimization scenario above passes.
- The matching app build passes lint for the changed admin screen and TypeScript.
- The known project-wide lint baseline is triaged separately.
- Owner and employee UI regression tests pass.
- The owner explicitly approves the production deployment plan.

## Current deployment status

On 2026-10-30, migrations 013 and 014 were applied to the only connected Klipp Supabase project and recorded as:

- `20261030113751` — `super_admin_rbac_foundation`
- `20261030113758` — `staff_rbac_enforcement_and_management`

A transactional dry run succeeded and was rolled back before application. Post-migration structural checks and rolled-back SQL-session tests for the owner, a synthetic Support employee, and a client passed. This does not replace real browser/native regression tests or real Storage document-access tests.

The app UI remains on the open draft PR branch and has not been deployed as an app release. No PR has been merged and `main` has not been changed.
