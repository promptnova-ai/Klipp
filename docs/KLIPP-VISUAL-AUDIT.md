# Klipp visual product audit

## Purpose

This audit evaluates the customer, professional and operations experiences as one product. The interaction model combines two useful reference patterns:

- **Uber-like service execution:** immediate action, clear availability, concise request acceptance, live location, ETA and status progression.
- **Airbnb-like service discovery:** strong visual category browsing, clear service details, transparent price and duration, confidence before committing, and a persistent primary action during checkout.

Klipp keeps its own visual identity: ivory canvas, ink typography, cobalt client/admin actions, coral PRO actions, mint/success surfaces, real Klipp mark, and a shared component grammar.

## Findings and changes applied

| Area | Audit finding | Change |
| --- | --- | --- |
| Shared screen headers | Page containers and headers both applied horizontal gutters, producing misaligned titles and content | Added an explicit header inset option and aligned page headers to the content grid |
| Client home / web | Used a placeholder K instead of the supplied Klipp mark; oversized marketing hero delayed the primary task; filter icon looked interactive but did nothing | Restored the real Klipp mark, removed the inert control and marketing hero, surfaced greeting, location, search and categories first |
| Client home / native | Category filtering used a different horizontal-chip presentation from web | Replaced it with the same image-led category cards and selection behavior as web |
| Client discovery | Category accents used unrelated purple, cyan, ochre and green hues | Consolidated service accents to Klipp cobalt, coral and mint |
| Client service cards | Web mobile cards were tall image-first cards while native cards were compact horizontal cards | Added a compact horizontal mobile layout to web to match native information hierarchy |
| Client account | Account page could overflow short screens; the account icon implied verification even when none existed; sign-out spacing could exceed the viewport | Added scroll-safe content, corrected gutters and removed the misleading verification mark |
| Authentication | Native login lacked password visibility and the registration path did not clearly expose PRO registration | Added password visibility and a direct professional registration entry point |
| Booking checkout | Continue/submit controls lived at the end of the scroll content | Moved wizard actions into a persistent footer, keeping the primary action visible |
| Live tracking | Map occupied excessive vertical space; mobile professional details and contact action shared a fragile horizontal row; map colors were outside the brand palette | Standardized map height and marker/route colors, and stacked the contact action on compact screens |
| PRO profile | Sign-out appeared before the actual profile settings and error feedback could be repeated | Moved sign-out to the end and removed duplicate error presentation |
| Admin navigation | Many section tabs wrapped into multiple rows on narrow screens | Changed section navigation to a single horizontally scrollable tab row |
| Bottom navigation | Press feedback was stronger than the system motion scale | Reduced press scaling and exposed correct tab semantics |
| App configuration | The /Klipp base path was set globally despite the app config intending it only for GitHub Pages | Removed the global base path; app.config.js now applies /Klipp only when GITHUB_PAGES=true; pinned the UI to the supported light theme |
| Maps and system accents | Several maps, notification indicators and loading states retained legacy teal/bright-blue colors | Migrated them to canonical Klipp tokens |

## Product-wide review checklist

### Entry and account
- Login and registration have the same brand, spacing, field height, focus treatment and primary action on web and native.
- Password visibility is available where passwords are used.
- Client and PRO registration remain clearly separated.
- OTP entry supports a six-digit code and resend without resetting the form.
- Empty, loading, error and confirmation states use the same visual language.

### Client
- Home prioritizes location, search and service categories.
- Category selection and service search behave consistently across web and native.
- Service detail sheets show service scope, professional options, price and duration before booking.
- Booking uses a visible step indicator and persistent back/continue/submit actions.
- Booking summary keeps service, address, time, professional and price in one coherent review.
- Booking history and tracking share the same status vocabulary.
- Tracking map, ETA, professional details and in-app contact remain legible at compact widths.
- Account and address menus are scroll-safe and do not imply unearned trust/verification.

### Klipp PRO
- Requests are the operational home; availability and incoming requests are immediately visible.
- Accept and reject actions remain visually distinct and difficult to trigger accidentally.
- Agenda, notifications and profile reuse the same layout and role accent.
- Identity status, equipment commitment and profile completion are explained before the professional can receive work.
- Sign-out remains at the end of account settings.

### Admin
- Admin sections are reachable without wrapping into an unpredictable multi-row menu.
- Operational maps use the same map colors and status semantics as tracking.
- Sensitive verification actions are visually distinct from ordinary profile editing.
- Audit and status states are readable without relying on color alone.

## Responsive acceptance viewports

| Viewport | Primary checks |
| --- | --- |
| 360 × 800 | Minimum tap targets, no clipped fields, two-column categories, compact cards, sticky booking action |
| 390 × 844 | Default mobile hierarchy, category labels, map and contact card |
| 768 × 1024 | Tablet gutters, service grid, menu wrapping and modal width |
| 1024 × 768 | Tablet landscape, booking sections and admin tab navigation |
| 1440 × 900 | Content max-width, consistent header/content alignment, desktop service grid |

## Verification status

- Source-level audit and code corrections: in progress / applied in the active development branch.
- TypeScript, lint and web export: must pass on the final audit commit.
- Browser/device screenshot review: still required for all authenticated screens.
- Live SMS, payment and production dispatch: outside this visual audit and must not be inferred from a successful export.
- PR #25 remains draft until visual screenshots and the manual release matrix have been reviewed.
