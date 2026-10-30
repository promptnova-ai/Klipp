# Klipp administration RBAC — Phase 2

## Scope

Phase 2 moves the permission model from foundation to enforcement for the administrative operations already present in the app.

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

- Both migrations are committed for review only. Neither has been executed in Supabase.
- No PR has been merged and `main` has not been changed.
- Do not assign employees restricted templates in production until migrations 013/014 and this app version have been deployed and tested together.
- The `professionals.manage`, booking, support, finance, and `settings.operational` capabilities are represented in the permission catalog, but not all have corresponding administrative UI/workflows in this phase. Do not interpret a seeded permission as a completed operational module.
- Critical settings are protected by `is_super_admin()` in the server-side RPC, not merely by a UI condition or an employee permission override.

## Validation status

The GitHub Actions run for the current branch completed successfully for dependency installation, lint of the changed admin screen, and TypeScript typecheck. The project-wide Expo lint command still reports 15 errors and 12 warnings in files outside the RBAC change; that baseline diagnostic is non-blocking in this workflow.

The following checks have **not** been run against a live Supabase project or a staging database:

1. SQL application against a disposable database matching the current Supabase schema.
2. SQL application against a disposable database matching the current Supabase schema.
3. Owner bootstrap, including the exact `admin@admin.com` profile/role precondition.
4. Support/operations/finance/custom template grants and explicit allow/deny/reset behavior.
5. Non-owner denial for staff changes and critical settings.
6. Account-list data minimization and private Storage access for owner, verification staff, document owner, and unrelated users.
7. Promotion, demotion, revocation, and audit-event behavior.
8. Regression of existing owner admin flows and mobile/web rendering.

The app checks ran in GitHub Actions: `npm ci` passed, `npx eslint src/components/admin-screen.tsx` passed, and `npx tsc --noEmit` passed. The full-app lint diagnostic remains open for the unrelated files noted above. Before executing either migration, run SQL/security tests in a controlled staging environment, then review the results.

## Deployment sequence after explicit approval

1. Confirm the live schema and the owner bootstrap precondition.
2. Apply migration 013 in staging and verify the owner identity and permission resolver.
3. Apply migration 014 in staging and test every permission boundary above.
4. Deploy the matching app build and test owner and restricted employee accounts on each supported platform.
5. Only after explicit validation, plan production migration execution. No migration is run automatically by this branch.
