# AutoApply — Security & Sessions Page Build Prompt

**Route:** `/app/settings/security or repository-equivalent`

**Purpose:** Protect account access.

## GLOBAL BUILD CONTRACT

Before touching this page, inspect the repository and determine the existing stack, routing, authentication, API contracts, data models, services, shared components, design system, and current implementation state. **Do not assume a backend exists and do not assume it is missing.**

- If the required backend/service/API already exists, integrate with the real implementation.
- If it does not exist, build the frontend around a clean, typed integration contract and document the exact backend capability required.
- If it partially exists, reuse it and complete only the missing boundary.
- Never fabricate production behavior with `setTimeout`, fake success, hardcoded user data, or local-only state transitions.
- Never duplicate existing backend business logic in the frontend.
- Use the repository's existing framework/tooling unless there is a concrete reason to change it.
- Use real routes from the framework, not state-based fake routing.
- Keep loading, error, empty, retry, disabled, and success states explicit.
- Keep user data dynamic; never hardcode a real user's name, email, phone, IDs, or records.
- Do not create a Specs/Architecture/Demo page in place of the actual product.
- Complete this page fully before moving to the next page. Run type/lint/build/tests relevant to the repository and fix issues you introduce.

## SHARED COLOR SYSTEM

Use one AutoApply design language across the entire platform. Prefer design tokens/CSS variables rather than scattered hex values.

- App background: `#F8FAFC`
- Surface/card: `#FFFFFF`
- Primary text: `#0F172A`
- Secondary text: `#475569`
- Muted text: `#64748B`
- Border: `#E2E8F0`
- Primary brand: `#1E40AF`
- Interactive blue: `#3B82F6`
- Soft blue surface: `#EFF6FF`
- Success: `#059669` / soft `#ECFDF5`
- Warning: `#D97706` / soft `#FFFBEB`
- Error: `#DC2626` / soft `#FEF2F2`
- Optional premium accent: `#7C3AED`

Color rules:
- Blue = primary action, active navigation, selected/interactive states.
- Green = confirmed/success only.
- Amber = waiting, attention, pending.
- Red = blocking/error/destructive only.
- Purple = optional accent for intelligence/advanced features, not primary actions.
- Avoid rainbow status systems and excessive gradients.
- Do not use glow effects as a substitute for hierarchy.
- Maintain accessible contrast.

## VISUAL DIRECTION

Serious modern SaaS: calm, precise, trustworthy, premium, fast. Use generous spacing, clear hierarchy, restrained borders, subtle shadows, and purposeful motion. Avoid generic AI/robot imagery, excessive glassmorphism, noisy 3D, visual clutter, fake statistics, fake testimonials, invented pricing, and unsupported claims.

## RESPONSIVE + ACCESSIBILITY

Build mobile-first. Verify mobile, tablet, and desktop. No horizontal overflow. Keyboard navigation, visible focus, semantic landmarks, labels, accessible errors, reduced-motion support, and usable touch targets are required.


## PAGE-SPECIFIC IMPLEMENTATION

Build session/security controls consistent with the real auth implementation. The design calls for rotating refresh tokens, secure cookies, session/device management, log out everywhere, new-device notifications, and step-up verification for sensitive changes. Show active sessions/devices, revoke individual session where supported, and log out everywhere. Never show tokens. If the backend does not expose a capability, show a non-deceptive unavailable/integration state.

## COMPLETION CHECK

- [ ] Repository state inspected before implementation
- [ ] Real framework route implemented
- [ ] Real data/API integration used when available
- [ ] Missing backend capability handled with an explicit integration contract, never fake success
- [ ] Loading/error/empty/retry states implemented
- [ ] Shared AutoApply colors/tokens used consistently
- [ ] Responsive on mobile/tablet/desktop
- [ ] Keyboard/accessibility requirements verified
- [ ] No unsupported claims or invented production data
- [ ] Type/lint/tests/build relevant to the repository pass after the change
- [ ] Direct route refresh/deep-link behavior verified
- [ ] No console/runtime errors introduced
