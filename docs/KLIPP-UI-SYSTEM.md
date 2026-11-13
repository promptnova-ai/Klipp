# Klipp — UI system and cross-screen consistency

## Non-negotiable product rule
Every route in the app must feel like the same Klipp product. Client, Klipp PRO and Admin may have role-specific content and accent colors, but must share layout grammar, navigation behavior, typography, spacing, motion, surface treatment, form controls, loading states, empty states and responsive rules.

## Brand source of truth
Use `src/theme/tokens.ts` as the single token source and `src/theme/themes.ts` for role accents. `src/lib/brand.ts` is a temporary compatibility barrel; new code must import directly from `@/theme/tokens` or `@/theme/themes` and `src/components/klipp-mark.tsx` for the actual brand mark. Never redraw, approximate or substitute the logo in previews or UI.

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


## Iterative quality audit — 13 November 2026

### Verified in the published web preview
- Entry/login flow inspected at desktop and 390px mobile viewport.
- Registration route inspected through the GitHub Pages SPA fallback.
- The original Klipp symbol is the asset rendered by the app; previews must use this asset, never a generated substitute.
- Login contained a repeated brand lockup (top bar plus showcase). The duplicate inside the showcase has been removed so the real master mark appears once in the page chrome.
- Client tracking now uses the shared role-aware brand header instead of a one-off title block.

### Additional corrections
- PRO onboarding header now follows the shared light canvas and border treatment; coral remains the PRO accent.
- Client and PRO navigation route identifiers were aligned with Expo Router filenames.
- Tab bar trigger typing was corrected without forwarding an incompatible component ref.
- Profile loading and admin operations initial fetch were deferred from effect bodies to avoid synchronous cascading state updates.

### Quality gate policy
- Project-wide Expo lint is now a blocking CI step; it is no longer allowed to fail silently.
- CI also runs TypeScript, web export, and Edge Function checks on pushes to `feat/caribbean-utility-standalone`.
- A green export is not a visual sign-off. Every route still needs a real rendered review at narrow mobile and desktop widths, plus interaction checks for navigation, validation, loading, empty, error, and success states.
- Authenticated Client, PRO, and Admin screens require a test account/session to verify fully. Do not infer their visual or operational correctness from static source review alone.


## Centralized design architecture — 13 November 2026

- `app/src/theme/tokens.ts` is the canonical source for palette, spacing, typography, radii, shadows, layout and motion.
- `app/src/theme/themes.ts` defines role accents. Client, PRO and Admin share the same components and layout grammar.
- `app/src/lib/brand.ts` remains a compatibility barrel for existing imports; new code must import directly from the theme modules.
- React Native does not have a browser-style global CSS cascade. Shared visual rules are implemented through typed tokens and reusable React Native components, so web and native stay aligned.
- New screen-level styles are permitted for composition and one-off content only; repeated controls, surfaces, typography and spacing must use the shared system.
- Deprecated color aliases remain temporarily to avoid breaking the existing app. Remove them only after a repository-wide usage audit and migration.


### Compatibility layers and migration policy

- `app/src/design-system/tokens/*` and `app/src/constants/theme.ts` are compatibility APIs for older components. They must only map to `app/src/theme/tokens.ts` and `app/src/theme/themes.ts`; they must not define independent palette, spacing, typography, radius, shadow or motion values.
- `app/src/global.css` is reserved for browser font-family variables. Brand colors, dimensions and component styling belong to the TypeScript theme and shared React Native primitives.
- New components must import from `@/theme/tokens` and `@/theme/themes`. New screen-specific values are allowed only when they express unique content composition, not a repeated design decision.
- The legacy `app/src/lib/brand.ts` is a temporary compatibility barrel. Existing imports can be migrated incrementally, but new imports must not use it.


### Centralization pass — implementation progress

- Created the canonical theme modules at `app/src/theme/tokens.ts` and `app/src/theme/themes.ts`.
- Migrated login (web/native), PRO onboarding, account, admin, client booking/tracking/address/notification routes, PRO agenda/profile/requests, shared headers, map surfaces and app entry screens to direct canonical theme imports.
- Converted the legacy `design-system/tokens/*` and `constants/theme.ts` APIs into compatibility mappings backed by the canonical tokens. They no longer define their own brand palette, spacing, typography, radii, shadows or motion.
- Removed duplicated brand color and radius declarations from `global.css`; it now contains only browser font-family variables.
- Shared buttons, fields, chips, empty states, cards, status pills and screen headers now consume centralized type, spacing, radius, shadow and role tokens.
- The legacy web tab component now uses the real Klipp mark and canonical surface, spacing and typography tokens.
- Validation is pending: GitHub Actions run `43413919964` is queued for lint/TypeScript and Edge Function checks. Vercel preview remains rate-limited, so this pass has not yet received a new rendered visual review.


### Registration UX redesign — 13 November 2026

- Registration is being aligned with the low-friction onboarding principles documented by Uber: ask for the minimum account-critical information first, avoid unnecessary choices, and reveal secondary details only when they are useful.
- Client registration no longer shows the promotional showcase panel; the first screen is focused on account creation and phone verification.
- Native client registration removes the phone/email method switch from the registration path and presents the form as one focused surface. Login retains the method switch.
- Klipp PRO onboarding step one now prioritizes name and mobile number. Experience, profile introduction and transport are optional and collapsed by default, so they do not block the first action.
- The PRO step-one hero banner was removed to reduce competing visual hierarchy. The original Klipp mark, shared palette and existing onboarding/business logic remain in place.
- This is an implementation pass, not visual sign-off. CI and a rendered preview still need to be checked before calling the redesign complete.
