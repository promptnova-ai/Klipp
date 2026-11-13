# Klipp — UX/UI and Release Quality Gates

A screen is **not complete** because it compiles, exports, or looks acceptable in one screenshot. Every release candidate must pass every applicable gate below. If a gate has not been run, mark it **NOT VERIFIED**, never PASS.

## 1. Brand and visual integrity
- Use the supplied Klipp identity as the source of truth. Do not invent substitute logos, initials, or unrelated iconography.
- Keep the Caribbean Utility visual language coherent across client, PRO, and admin surfaces: ivory canvas, ink/navy text, cobalt client actions, coral PRO actions, mint confirmation states.
- Avoid generic AI-generated SaaS patterns: repetitive card grids, arbitrary gradients, decorative badges, generic dashboard layouts, stock imagery unrelated to Dominican Republic services, filler slogans, and inconsistent controls.
- Aim for the clarity and motion quality of Airbnb/Uber without copying their identity or layouts.
- Verify hierarchy, spacing, typography, contrast, imagery crop, loading/empty/error/success states, and focus/pressed/disabled states.

## 2. Responsive and interaction matrix
Test at minimum:
- 360 × 800 and 390 × 844 mobile viewports.
- 768 × 1024 tablet.
- 1024 × 768 compact desktop.
- 1440 × 900 desktop.
- iOS, Android, and web where the component is supported.

Acceptance:
- No overlapping, clipped, hidden, or horizontally overflowing controls.
- Keyboard never obscures the active field or primary action; scroll/focus behavior is correct.
- Touch targets are comfortable (minimum 44 × 44 px where practical).
- Horizontal step transitions are smooth and do not conflict with vertical scrolling or text entry.
- Reduced-motion preference disables non-essential animation.
- Back, forward, swipe, disabled, loading, and error states are all tested.

## 3. Client authentication
- Dominican phone prefixes +1 809, +1 829, and +1 849 are explicit and normalized to E.164.
- Registration requires name, a valid 7-digit subscriber number, and a real six-digit SMS OTP.
- OTP is actually requested and verified by Supabase; never simulate a successful verification.
- Existing phone login must not silently create a new account.
- Email/password login remains available as a fallback.
- Verify invalid number, invalid/expired OTP, resend/change-number, network failure, duplicate account, session restore, sign-out, and profile creation.

## 4. Klipp PRO onboarding
The onboarding is eight distinct, validated steps:
1. Personal/contact profile.
2. Exactly one primary profession.
3. Profession-specific specialty and required details.
4. Price and duration for every configured tier.
5. Equipment requirements and explicit confirmation that the PRO brings their own tools/materials.
6. Work location and coverage radius.
7. Weekly availability and valid time range.
8. Account creation and review.

Test every profession in the catalog, including conditional fields, empty catalog, missing tiers/equipment, invalid prices, location denial, map adjustment, and interrupted/restarted onboarding. Confirm the final payload persists correctly and that a PRO cannot register multiple professions.

## 5. Functional, data, and security regression
- Validate both client and PRO journeys against real Supabase behavior, not mock-only UI.
- Check loading, empty, error, retry, success, and offline states.
- Confirm database writes, profile metadata, role routing, RLS, and authorization boundaries.
- Ensure the onboarding cannot bypass required policy acknowledgements or service configuration.
- Run existing Edge Function checks and booking/notification regression tests.

## 6. Mandatory release gate
A candidate may be called **READY** only when all are green:
- ESLint and TypeScript.
- Expo web export/build.
- Edge Function checks.
- Browser visual/interaction review at the viewport matrix.
- Real Supabase OTP and profile integration test.
- Client and PRO regression scenarios.
- No unresolved critical/high UX, data, security, or accessibility defects.

If browser/device or real SMS credentials are unavailable, record those gates as **NOT VERIFIED** and keep the PR in draft. Never infer a pass from a green build.
