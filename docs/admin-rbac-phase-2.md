# Klipp administration RBAC — Phase 2

## Scope

Phase 2 moves the permission model from foundation to enforcement for the administrative operations already present in the app.

- Account listing requires `accounts.read`; verification metadata and private document paths are returned only when the caller also has `verification.review`.
- Client/pro role changes require `accounts.manage_clients`.
- Granting or revoking administrator status remains exclusive to the platform owner.
- Professional approval/rejection and private verification-document reads require `verification.review`.
- Catalog category, service, and pricing changes require `catalog.manage`.
- Reading operational settings requires `settings.operational`.
- Commission and request-expiry changes are treated as critical and restricted to the platform owner.
- The owner receives staff listing, template assignment, per-user allow/deny overrides, staff access revocation, and audit-log listing RPCs. Each staff-management action is written to `admin_audit_log`.
- Newly promoted administrators receive the empty `custom` template by default. Demoted administrators have staff assignments and overrides removed.
- Direct access to the owner/RBAC tables remains revoked; staff access is mediated through security-definer RPCs.

## Important boundaries

- The migration is prepared for review only. It has **not** been executed in Supabase.
- This phase adds backend RPCs and permission checks. The owner-only staff management UI and permission-aware navigation are still pending.
- Until the UI is updated, the existing admin screen should not be used to assign restricted employee access: it still assumes every administrator can load every panel and attempts to show critical settings. Keep existing admin access unchanged until the UI phase is complete.
- Booking management, support case management, finance workflows, integrations, credentials/secrets, and destructive platform controls are not implemented in this phase because the current app migrations do not expose those operational RPCs yet.
- The owner account cannot be modified or revoked through staff-management RPCs.
- No migration is automatically applied, no PR is merged, and `main` is untouched.

## Review and validation still required

Before execution, review the migration against the live Supabase schema and run staged tests for:
1. owner bootstrap and owner-only staff management;
2. support/operations/finance/custom template permissions and explicit deny overrides;
3. non-owner denial for staff changes and critical settings;
4. account listing data minimization;
5. private storage signed-URL access for owner, verification staff, and unrelated users;
6. promotion/demotion cleanup and audit events;
7. regression of existing owner admin flows.

The app UI must be updated and tested before assigning employees restricted templates in production.
