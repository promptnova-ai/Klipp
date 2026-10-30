# Klipp administration RBAC — Phase 1

## Decision

- The existing admin@admin.com account is the single platform owner / super-administrator.
- The owner is identified by a protected server-side platform_owner row, not by a client-provided email, app metadata, or a UI flag.
- Existing profiles.role = 'admin' remains the staff administrator account type. It is not equivalent to platform ownership.
- Only the owner can grant or revoke admin status. Ordinary administrators can continue managing client/pro account roles, but cannot promote themselves, promote another employee, demote an administrator, or modify the owner.
- Employee access is being prepared around role templates (Support, Operations, Finance, Custom) plus per-user allow/deny overrides. Explicit overrides take precedence over template grants.
- Sensitive capabilities are identified in the permission catalog. The owner bypasses staff permission checks; staff must receive explicit permission.

## Phase 1 scope

This phase adds the server-side owner identity, role templates, permission catalog, assignment/override tables, a permission resolver, and a guard on the existing role-management RPC.

It deliberately does not yet change the admin UI or migrate every existing admin RPC to permission-specific checks. Existing operational admin features remain compatible until Phase 2 converts each operation to a named permission. Do not treat the template tables as active staff restrictions until that conversion is complete.

## Security properties

- Owner bootstrap fails closed unless exactly one existing admin@admin.com account has a matching profiles row with role admin.
- The migration refuses to silently transfer ownership if a different owner is already configured.
- Owner and RBAC tables have RLS enabled and direct client privileges revoked.
- The owner cannot be modified through the existing account-role RPC.
- A normal administrator cannot grant or revoke administrator access.
- The service-role key must never be shipped in the mobile/web client.
- Critical platform, auth, database, payment-provider, and secret settings remain owner-only and must be enforced by server-side RPC/Edge Functions in later phases.

## Permission templates seeded

- **Support:** accounts.read, bookings.read, support.manage
- **Operations:** accounts.read, accounts.manage_clients, professionals.manage, verification.review, bookings.read, bookings.manage, catalog.manage, settings.operational
- **Finance:** finance.read, finance.reconcile
- **Custom:** no default grants; add explicit per-user permissions.

## Not yet done

- Assign employee templates from an owner-only screen.
- Convert existing admin RPCs and Storage signed-URL issuance to named permission checks.
- Add admin/staff management UI and audit-log viewer.
- Add owner-only critical settings UI with re-authentication, confirmation, audit trail, and recovery safeguards.
- Add tests for owner bootstrap, staff privilege escalation, permission overrides, and cross-role access.
- Execute the migration. This file is committed for review only; the user must validate it before running it in Supabase.
