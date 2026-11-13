# Klipp — UI system and cross-screen consistency

## Non-negotiable product rule
Every route in the app must feel like the same Klipp product. Client, Klipp PRO and Admin may have role-specific content and accent colors, but must share layout grammar, navigation behavior, typography, spacing, motion, surface treatment, form controls, loading states, empty states and responsive rules.

## Brand source of truth
Use `src/lib/brand.ts` as the token source and `src/components/klipp-mark.tsx` for the actual brand mark. Never redraw, approximate or substitute the logo in previews or UI.

- Canvas: Ivory `#F7F5F0`
- Ink: `#171B2D`
- Primary: Cobalt `#3D5AFE`
- PRO accent: Coral `#FF7058`
- Supporting accent: Mint `#BCEBD8`
- Surface: White `#FFFFFF`
- Borders: warm neutral `#E8E5DE`

## Shared screen grammar
1. Same page gutter and centered content width on every route.
2. Same brand header: authentic Klipp symbol, role label, location context, eyebrow, title and optional subtitle/action.
3. Same type scale: one page title, clear section headings, readable body, quiet metadata.
4. Same controls: shared button, field, chip, card, status and icon treatment. Avoid one-off radii, shadows and arbitrary colors.
5. Same states: loading, empty, error, offline, disabled and success states use the shared primitives.
6. Same navigation: role-aware five-position bottom navigation with the original Klipp mark centered; hidden workflow routes remain reachable through their intended actions.
7. Same motion: short, restrained transitions; respect reduced-motion preferences. Do not reload the app shell between tab changes.
8. Responsive: no overlap or clipped controls at 360px, 390px, tablet widths and desktop. Content max width and gutters adapt without changing the design language.

## Role expression
- Client: cobalt for primary actions and selected navigation.
- Klipp PRO: coral for availability, accept/active states and role identity; cobalt remains part of the shared brand.
- Admin: cobalt as primary; use status colors only for semantic statuses.
Role colors must never create a different page template.

## Route audit checklist
- Auth: login, register, professional onboarding.
- Client: home, bookings, notifications, account, addresses, new booking, tracking.
- PRO: requests, agenda, notifications, profile.
- Admin: operations, verification, accounts, issues, configuration, staff.
- Shared: loading/error states, modals, maps, forms, empty states, responsive navigation.

## Acceptance gate
A route is not considered aligned until it uses shared tokens/components, passes lint and TypeScript, exports to web, and has been visually checked against the same viewport matrix. Do not publish illustrative previews; use screenshots rendered from the actual branch and actual assets only.
