# Klipp administration RBAC — Phase 2

## Scope

Phase 2 enforces the permission model for the administrative operations already present in the app.

### Backend enforcement

- Account listing requires `accounts.read` or `verification.review`; verification metadata and private document paths are returned only to callers with `verification.review`.
- Client/pro role changes require `accounts.manage_clients`.
- Granting or revoking administrator status remains exclusive to the platform owner.
- Professional approval/rejection and private verification-document reads require `verification.review`.
- Catalog category, service, and pricing changes require `catalog.manage`.
- Reading operational settings requires `settings.operational`. The current `platform_settings` table contains only owner-managed critical values, so the read RPC returns an empty object to employees until noncritical keys are explicitly introduced and allow-listed.
- Commission and request-expiry changes are critical settings and restricted to the platform owner.
- The owner has staff-listing, template-assignment, per-user allow/deny/reset overrides, staff-access revocation, and audit-log listing RPCs. Staff-management actions are written to `admin_audit_log`.
- Newly promoted administrators receive the empty `custom` template by default. Demoted administrators have staff assignments and overrides removed.
- Direct access to owner/RBAC tables remains revoked; staff administration is mediated through owner-checked security-definer RPCs.

### Application UI

The owner-only Control Center and permission-aware admin navigation are implemented in `app/src/components/admin-screen.tsx`.

- The owner sees **Equipo y permisos**, employee templates, per-user permission overrides, access revocation with confirmation, and the latest 100 audit entries.
- Only the owner can promote an account to administrator or change critical commission/request-expiry settings.
- Employees see only the sections granted by their server-side permissions. The backend independently enforces each operation; hiding a tab is not the security boundary.
- Verification-only staff can see the professional review queue; account listing is limited server-side to professional accounts unless `accounts.read` is also granted.
- An employee first registers through the normal Klipp sign-up flow. The owner then promotes that account from **Cuentas y roles**; the new administrator starts with the empty `custom` template.
- The UI does not yet provide administrative workflows for bookings, support cases, finance, integrations, credentials/secrets, or destructive platform controls because the existing app schema does not expose the required management RPCs.

## Important boundaries

- Migrations 013 and 014 have now been applied to the only connected Supabase project. That project was not a disposable staging environment.
- No PR has been merged and `main` has not been changed.
- The app code remains on `security/013-super-admin-rbac`; this work has not been deployed as a web/native app release.
- Do not assign employees restricted templates for day-to-day use until the matching app build has been deployed and browser/native regression tests have passed.
- The `professionals.manage`, booking, support, finance, and `settings.operational` capabilities are represented in the permission catalog, but not all have corresponding administrative UI/workflows in this phase. Do not interpret a seeded permission as a completed operational module.
- Critical settings are protected by `is_super_admin()` in the server-side RPC, not merely by a UI condition or an employee permission override.

## Live database validation

The two migrations were first executed together inside a transaction and rolled back; the dry run completed without SQL errors. They were then applied sequentially using Supabase migration tracking:

- `20261030113751` — `super_admin_rbac_foundation`
- `20261030113758` — `staff_rbac_enforcement_and_management`

Read-only post-migration checks confirmed:

- Exactly one owner singleton exists and points to the expected `admin@admin.com` profile.
- Six RBAC tables exist with RLS enabled.
- Four role templates and fourteen permission catalog entries exist.
- All eight owner-only staff RPCs are present.
- The private verification Storage policy and catalog permission policy are present.

Authenticated SQL-session tests (all wrapped in transactions and rolled back) confirmed:

- Owner: `is_super_admin() = true`; permission resolver grants owner access; four templates are visible; the `custom` template is empty; owner staff list and audit-log RPCs return expected records.
- Synthetic Support employee: `is_super_admin() = false`; `accounts.read = true`; `verification.review = false`; `settings.operational = false`; account listing returns 12 rows and exposes zero non-null verification metadata fields.
- Client: `is_super_admin() = false` and `accounts.read = false`.

These tests used simulated JWT subject claims inside rolled-back SQL transactions. They do not replace tests from real owner/employee browser sessions or real Storage access tests.

- Synthetic Operations employee (rolled back): `is_super_admin() = false`; `verification.review = true`; `settings.operational = true`; the settings RPC returned zero keys, confirming commission/request-expiry values are not exposed.
- Privilege checks: `authenticated` and `anon` cannot directly SELECT the owner/RBAC tables; `anon` cannot execute the owner staff RPC; authenticated users can execute the RPC endpoint, which checks owner identity internally.
- Final database state after test rollbacks: one admin role (the owner), zero employee assignments, zero overrides, and one owner singleton.

## Security advisor findings

The post-migration Supabase security advisor still reports:

- Existing `public.pro_cards` view flagged as SECURITY DEFINER.
- Six pre-existing SECURITY DEFINER functions executable by `anon`.
- SECURITY DEFINER RPCs executable by `authenticated`, including the new admin RPCs. These are intentionally callable by signed-in users and perform authorization checks internally; still review the function bodies and grants.
- RLS-enabled tables with no policies, including the new RBAC tables. Direct table privileges are revoked intentionally and access is mediated through checked RPCs; verify this invariant before any future grant changes.
- Existing mutable search_path warning on `create_booking()`, plus performance linter findings unrelated to these migrations.

No unrelated advisor finding was automatically changed as part of this RBAC deployment.

## Remaining validation and release work

- Test the owner and a real restricted employee in authenticated browser sessions.
- Test real private Storage document access for document owner, verification staff, and unrelated users using synthetic documents.
- Exercise promotion, demotion, permission overrides, revocation, and audit events through the UI.
- Deploy the matching app build and test web and native layouts and existing client/pro registration, bookings, verification, and catalog flows.
- GitHub Actions previously passed `npm ci`, ESLint for the changed admin screen, and `npx tsc --noEmit`. Project-wide Expo lint still reports 15 errors and 12 warnings in unrelated files.
