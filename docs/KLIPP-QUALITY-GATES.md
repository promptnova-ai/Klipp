# Klipp quality gates

## Automated checks

The `.github/workflows/validate-app.yml` workflow runs for pushes to `main` and the active development branch, pull requests targeting `main`, and manual dispatch.

The application job runs:
1. `npm ci` using the committed lockfile and Node 22.
2. Project-wide Expo lint.
3. Targeted ESLint on redesigned client, PRO, admin, authentication, account, navigation and shared UI files.
4. `npm run typecheck` (`tsc --noEmit`).
5. `npx expo export --platform web` with placeholder Supabase public configuration.

The Edge Function job runs:
1. Deno tests for shared authentication utilities.
2. Type checks for notification dispatch, automatic booking assignment and route ETA functions.

Local commands from `app/`:
- `npm run lint`
- `npm run typecheck`
- `npm run verify` (lint + TypeScript)

## Manual release acceptance matrix

Automated compilation is necessary but does not prove that the app is usable. Before removing draft status or merging, review each item on a real browser preview and, where relevant, a device/simulator.

| Area | Scenarios to verify | Pass criteria |
| --- | --- | --- |
| Authentication | Client and PRO login; OTP request and confirmation; invalid/expired OTP; resend; logout | Clear errors, no stuck loading, correct role routing, no session leakage |
| Client onboarding | Required fields, Dominican phone formats (+1-809/+1-829/+1-849), back/continue, refresh/reopen | Data persists as designed; validation is field-specific; no overlapping controls |
| PRO onboarding | Select exactly one profession; profession-specific required fields; missing documents; back/continue | Only one service can be selected; correct fields and validation for that profession |
| Client booking | Category/search, service selection, address, date/time, price, payment failure/success | Price and service remain consistent; no duplicate booking on repeated taps; clear confirmation |
| Nearby dispatch | No professionals nearby; one or multiple candidates; accept; reject; timeout | Correct candidate eligibility, countdown and state transitions; no stale offer or double assignment |
| PRO requests | Receive request; accept by slide; reject by hold; timeout; loss of connectivity | No accidental accept/reject; state returns to the correct availability status |
| Tracking | Assigned, en route, arrived, started, completed, cancelled; location unavailable | ETA and status are truthful; map failure has a useful fallback; updates do not regress |
| Agenda and profile | Edit profile, availability, service details, schedule and empty states | Saved values reload correctly; role-only data is not exposed to clients |
| Notifications | Read/unread, preferences, push permission denied/granted, deep links | Correct destination, no duplicate notifications, graceful permission fallback |
| Admin | Search bookings, inspect booking, reassign, cancel with reason, permissions and audit history | Every sensitive action is authorized, confirmed, recorded and reflected in the booking |
| Responsive layout | 360px, 390px, tablet and desktop; long names/addresses; large text | No clipping, overlap, horizontal overflow or inaccessible controls |
| Accessibility | Keyboard navigation, screen reader labels, focus states, reduced motion | All actions reachable and announced; motion respects reduced-motion preference |

## Release policy

- Keep PR #25 in draft until automated jobs pass and the manual acceptance matrix has been exercised.
- Never use production payment credentials, customer data or live dispatch to validate a preview.
- Record failed scenarios with the route, test account role, viewport/device, steps and expected/actual result.
- Vercel deployment throttling is an infrastructure limitation, not a successful build. A green GitHub workflow does not replace a working preview.
- Do not claim end-to-end, payment or push delivery testing unless those integrations have been exercised in a controlled environment.
