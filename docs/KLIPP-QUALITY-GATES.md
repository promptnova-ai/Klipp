# Klipp quality gates

## Automated checks

The `.github/workflows/validate-app.yml` workflow runs for pushes to `main` and the active development branch, pull requests targeting `main`, and manual dispatch.

The application job runs:
1. `npm ci` using the committed lockfile and Node 22.
2. Project-wide Expo lint.
3. Targeted ESLint on redesigned client, PRO, admin, authentication, account, navigation and shared UI files.
4. `npm run typecheck` (`tsc --noEmit`).
5. `npx expo export --platform web` with placeholder Supabase public configuration.
6. Install Chromium and capture the public entry screen at 390×844 and 1440×900. Upload both rendered screenshots as the `klipp-visual-audit-screenshots` workflow artifact for visual review.

The Edge Function job runs:
1. Deno tests for shared authentication utilities.
2. Type checks for notification dispatch, automatic booking assignment and route ETA functions.

Local commands from `app/`:
- `npm run lint`
- `npm run typecheck`
- `npm run verify` (lint + TypeScript)

## Manual release acceptance matrix

Automated compilation and screenshot capture are necessary but do not prove that the app is usable. The screenshots cover the public entry only; authenticated Client, PRO and Admin routes still require a controlled test session. Before removing draft status or merging, review each item on a real browser preview and, where relevant, a device/simulator.

| Area | Scenarios to verify | Pass criteria |
| --- | --- | --- |
| Authentication | Client and PRO login; RD phone formats (+1-809/+1-829/+1-849); OTP request, six-digit validation, resend, invalid/expired OTP, email confirmation/resend and logout on web/native | Valid codes are accepted; malformed codes are rejected; phone formatting is normalized; resend is rate-limit safe; correct role routing and no session leakage |
| Client onboarding | Required fields, Dominican phone formats (+1-809/+1-829/+1-849), back/continue, refresh/reopen | Data persists as designed; validation is field-specific; no overlapping controls |
| PRO onboarding and verification | Select exactly one profession; email confirmation and resend; upload ID document (PDF/JPG/PNG, max 10 MB); replace document; admin approval/rejection with reason | Email must be confirmed; private document is stored under the user's own path; approval requires the document and confirmed email; rejected profiles remain undiscoverable until re-reviewed |
| Client booking | Category/search, service selection, address, date/time, price, payment failure/success | Price and service remain consistent; no duplicate booking on repeated taps; clear confirmation |
| Nearby dispatch | No professionals nearby; one or multiple candidates; accept; reject; timeout | Correct candidate eligibility, countdown and state transitions; no stale offer or double assignment |
| PRO requests | Receive request; accept by slide; reject by hold; timeout; loss of connectivity | No accidental accept/reject; state returns to the correct availability status |
| Tracking | Assigned, en route, arrived, started, completed, cancelled; location unavailable | ETA and status are truthful; map failure has a useful fallback; updates do not regress |
| Agenda and profile | Edit profile, availability, service details, schedule and empty states | Saved values reload correctly; role-only data is not exposed to clients |
| Notifications | Read/unread, preferences, push permission denied/granted, deep links | Correct destination, no duplicate notifications, graceful permission fallback |
| Admin and identity review | Open private ID document through expiring signed URL; approve or reject with a reason; verify role permissions and audit history | Only authorized reviewers can access documents; approval is impossible without an uploaded document and confirmed email; every decision is audited |
| Responsive layout | 360px, 390px, tablet and desktop; long names/addresses; large text | No clipping, overlap, horizontal overflow or inaccessible controls |
| Accessibility | Keyboard navigation, screen reader labels, focus states, reduced motion | All actions reachable and announced; motion respects reduced-motion preference |

## Release policy

- Keep PR #25 in draft until automated jobs pass and the manual acceptance matrix has been exercised.
- Never use production payment credentials, customer data or live dispatch to validate a preview.
- Record failed scenarios with the route, test account role, viewport/device, steps and expected/actual result.
- Vercel deployment throttling is an infrastructure limitation, not a successful build. A green GitHub workflow does not replace a working preview.
- Review the screenshots uploaded by the visual capture step at 390×844 and 1440×900. They are evidence for inspection, not an automated visual pass/fail verdict.
- Do not merge while authenticated route screenshots, device checks or the manual acceptance matrix remain outstanding.
- Do not claim end-to-end, payment or push delivery testing unless those integrations have been exercised in a controlled environment.
