# Klipp — UI and state audit

Date: 2026-11-05  
Branch: `fix/auth-ui-klipp-services`  
Scope: source-level review of Expo Router screens, UI states, responsive layout, brand consistency and the client/professional/admin journeys.

## Executive summary

The app has distinct client and Klipp PRO workspaces, a shared Caribbean Energy palette and a set of reusable brand headers. The current branch improves the main screen hierarchy and responsive widths. The most important product-flow issue found in this review was a mismatch between the booking mode labels and their behavior: the option labelled “Cerca de mí” selected manual professional selection, while automatic dispatch had a separate label. This has been corrected so the choices are “Elegir profesional” (manual) and “Cerca de mí” (automatic dispatch).

The booking screen also requested GPS permission as soon as it opened. It now waits for the customer to press the location action, making the permission request contextual and explicit.

## Screens and states reviewed

### Authentication
- Login screen.
- Client registration.
- Professional registration entry point.
- Loading, validation and authentication error presentation in the shared auth screen.

### Client
- Home/catalog: loading, catalogue error, empty search results, location feedback and category selection.
- New booking: service selection, equipment notice, pricing tier, immediate/scheduled timing, location permission/loading/error, date selection, slot loading/empty/available, manual professional discovery, expanded professional profile, automatic dispatch estimate, booking summary, submission and success/error feedback.
- Addresses: loading, saved-address list, add-address form, GPS action, validation, save success/error.
- Bookings: loading, empty/populated list, booking status, ETA/contact/chat affordances and refresh.
- Tracking: en-route ETA/map, professional card, destination, status message and status history.
- Notifications: inbox, unread/read states, mark-all-read, in-app/push preferences and device registration.
- Account: account details and sign-out action.

### Klipp PRO
- Incoming requests: empty inbox, incoming request modal, countdown, expired/disabled state, decline and slide-to-accept actions.
- Reassignment requests: pending replacement, accept/decline and expiry display.
- Agenda: availability/presence, active bookings, location sharing and empty agenda.
- Profile: editable identity, coverage, services, prices, availability, portfolio and verification state.
- Notifications: shared inbox and preference controls.

### Administration
- Operations panel.
- Staff and permission management.
- Account and professional review.
- Service categories, services and pricing tiers.
- Incident queue, review/resolution/reopen states.
- Critical settings and audit activity.

## Changes made during this audit

- Corrected booking mode labels so manual selection is “Elegir profesional” and automatic dispatch is “Cerca de mí”.
- Removed automatic GPS permission request when opening the booking screen; location is requested only after the customer chooses to share it.
- Aligned loading and refresh accents with the client blue / PRO violet-cyan palette.
- Refined the booking screen's desktop content width and selected-date state.
- Centered the admin dashboard on wide screens and improved section surfaces.
- Constrained the PRO incoming-offer modal for tablet/desktop widths.
- Continued aligning client tracking, addresses, bookings, PRO profile, agenda, notifications and offer screens to the shared palette.

## Visual QA status and limitations

This is a source-level audit plus CI/deployment review. It is **not** a completed manual visual QA pass on physical iOS/Android devices. The current preview can be used to inspect the actual web build, but each authenticated role and data-dependent state requires a suitable test account and seeded records.

Screenshots for every state are not attached to this report. A browser session capable of rendering the protected preview and capturing screenshots was not available during this audit. Do not treat source-level state coverage as proof that every state has been visually verified.

## Recommended visual review order

1. Login and client registration.
2. Client home and category/search states.
3. New booking: “Elegir profesional” versus “Cerca de mí”.
4. Booking location, date/time, professional selection and summary.
5. Client bookings, tracking and notifications.
6. Klipp PRO requests, countdown, agenda and profile.
7. Admin operations, staff permissions and review queues.

## Release blockers outside visual design

- Payment collection, provider webhooks, refunds, payout execution and ledger reconciliation remain incomplete; the presence of database tables is not a live payment integration.
- Real concurrent dispatch/load testing is still required.
- Full native-device verification, accessibility pass and seeded end-to-end tests are pending.
- The security migration that revokes execution from trigger-only functions is committed in the branch but has not been applied to the live database.

## Release discipline

Changes remain on `fix/auth-ui-klipp-services` and in the open pull request. No merge to `main`, production deployment or live database migration was performed as part of this audit.

## Visual polish pass — 2026-11-05

The follow-up implementation adds a more editorial visual direction to the entry and booking journeys:

- Authentication now uses a full photographic showcase on wide layouts and a cropped photographic hero on compact layouts, with a contrast overlay and animated form transitions.
- Klipp PRO onboarding uses a photographic header, a larger visual frame, animated directional step transitions, and an animated progress indicator.
- The client home hero uses a full-bleed service image with a dark readability overlay and the shared coral/teal identity.
- Root stack navigation now uses a short horizontal transition; booking sections animate into view when they appear.
- Booking selection surfaces, date states, professional cards, and notices now use the coral/teal system rather than leftover blue selection treatments.
- Native entry transitions use the native animation driver where supported; web uses the compatible JS driver.

### Validation boundary

GitHub Actions completed lint and TypeScript successfully for commit `010c4e4b3024e3449971ab6152c5ab84026c57f3`. Later visual-only changes are being revalidated on the current branch head. Vercel preview deployment is still queued/building. No screenshot-based visual QA or physical iOS/Android device validation has been completed, so final spacing, crop behavior, font rendering, and reduced-motion behavior still need device/browser review.
