# Klipp — UX/UI audit

**Scope:** branch `feat/caribbean-utility-standalone`, reviewed 13 November 2026.  
**Reference products:** Airbnb, Uber and Trade Republic. The goal is to adapt their interaction principles to Klipp, not copy their branding.

## Product principles

- **Airbnb:** welcoming clarity, a single understandable entry point, progressive disclosure, calm typography and consistent motion.
- **Uber:** reduce decisions before the user can act; phone-first onboarding; clear states and predictable recovery paths.
- **Trade Republic:** restrained visual hierarchy, precise copy, visible security, low-noise forms and deliberate confirmation states.
- **Klipp:** Dominican Republic phone conventions, DOP prices, separate client and professional journeys, service-at-home context and live professional tracking.

## Audit findings

| Priority | Area | Finding | Status |
|---|---|---|---|
| P0 | Authentication | Web and native auth screens had different compositions; native retained the old stock-photo hero. | Fixed: native auth now shares the web implementation. |
| P0 | Client home | Web and native home screens were materially different implementations (585 vs 232 lines), creating a platform-specific product. | Fixed: both now share the same responsive screen implementation. |
| P1 | Brand system | Login and in-app headers used different brand lockups and location labels. | Partially fixed: common in-app header now uses the KLIPP / SANTO DOMINGO, RD lockup. |
| P1 | Typography | The login had explicit Arial fallbacks and an Inter declaration without a bundled font; visual rendering could differ by platform. | Fixed in auth/global CSS: platform system sans-serif is used rather than an unloaded font. |
| P1 | Registration | Professional onboarding is an eight-step flow with many fields. It is progressive, but the code does not currently persist a resumable draft in local storage. | Open: add safe draft persistence (never persist passwords or OTPs) and clearer progress/resume. |
| P1 | Recovery | Email/password login has no visible forgotten-password path or reset screen. | Open: implement end-to-end recovery including deep link and password update. |
| P1 | Phone entry | Dominican phone examples are shown, and 10-digit input normalizes to +1, but there is no explicit country-code control or visible explanation of the supported format. | Open: add country selector/default RD and clear validation. |
| P1 | OTP | The client auth screen offers change-number but no resend action with a cooldown and delivery-state explanation. | Open: add resend with cooldown, expiry and rate-limit feedback. |
| P1 | Design tokens | Core screens still contain many hard-coded font sizes and radii instead of using the shared typography and spacing tokens. | Open: migrate screens to a small, governed token scale. |
| P2 | Client discovery | The client home, service selection and booking flow should be tested as one journey, especially category discovery, provider selection, price clarity and address confirmation. | Open: visual and interaction QA required. |
| P2 | Professional operations | Incoming request, accept/decline, materials confirmation, agenda and profile need a unified visual state model. | Open: audit every request state and edge case. |
| P2 | Navigation | Client and PRO use the shared Klipp tab bar, but each screen still needs checks for active state, hierarchy, mobile safe areas and desktop behavior. | Open: responsive QA. |
| P2 | Accessibility | Shared motion primitives respect reduced-motion preference. Continue checking labels, focus order, touch targets, contrast and keyboard behavior screen by screen. | Partially implemented. |

## Changes made in this pass

1. Removed the login stock-photo showcase from the web login; mobile no longer shows it because native and web now share the same auth implementation.
2. Reworked the login composition around a restrained dark brand header, typographic introduction and simpler form.
3. Replaced hard-coded Arial auth typography with the platform system sans-serif stack.
4. Updated the shared in-app brand header to use the KLIPP lockup and SANTO DOMINGO, RD label.
5. Unified client home implementation across web and native.
6. Kept the work on `feat/caribbean-utility-standalone`; production/default branch was not changed.

## Acceptance criteria before calling the UX pass complete

- Same information architecture and visual system on web, iOS and Android, with platform-appropriate controls.
- Login and registration tested for new client, returning client, unknown phone, invalid phone, expired OTP, resend, wrong OTP, email login, wrong password, password recovery and interrupted network.
- Professional onboarding tested from start to submission, including validation, back/forward, app restart, one-profession constraint, pricing, equipment confirmation, location and availability.
- Booking tested from category selection through payment, assignment, cancellation, tracking and completion.
- Professional request states tested for accept, reject, timeout, materials confirmation, reassignment and offline behavior.
- Screenshots reviewed at narrow mobile, large mobile, tablet and desktop widths.
- Accessibility review: keyboard, screen reader labels, contrast, touch target size and reduced motion.
- CI lint, TypeScript and web export pass; responsive screenshots reviewed after deployment.

## Reference reading

- Uber, [Unifying Mobile Onboarding Experiences](https://www.uber.com/hr/en/blog/mobile-onboarding/)
- Uber, [Uber's Unified Signup and Login Stack](https://www.uber.com/gb/en/blog/usl-ubers-unified-signup-and-login-stack/)
- Google Design, [Airbnb: Communicating Clarity and Charm](https://design.google/library/airbnb-invites-you-in)
- Trade Republic, [How can I log in to the app?](https://support.traderepublic.com/es-es/1359-How-can-I-log-in-into-my-Trade-Republic-account)
- Android Developers, [Authentication & Onboarding](https://developer.android.com/design/ui/mobile/guides/patterns/onboarding)
