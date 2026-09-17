# SNU V2 visual system — Editorial University

## Status
Approved by the product owner on 2026-09-17 for Student and Faculty portals. This document is binding for every AI or human design change until the owner changes direction.

## Scene and intent
An Arabic university service used daily by students and faculty on ordinary laptops and phones. It should feel like an official academic publication and service desk: credible, quiet, information-first, and specific to SNU. It must not resemble a generic SaaS/AI dashboard.

The existing MyU service at `https://myuportal.snu.edu.eg/` is a structural reference for direct, service-first language. Automated text retrieval confirmed the SNU Ibn Al-Haitham student-services context, but sandbox DNS prevented reliable pixel inspection. Do not claim exact visual parity without an owner-provided screenshot.

## Direction
- Warm paper surfaces, ink navy, rare oxblood accent, restrained brass detail.
- Editorial hierarchy through Arabic display type, rules, whitespace, numbering, and asymmetric mastheads.
- Flat layers and lists before cards. Cards only when content is independently actionable.
- Product density and clarity before decoration.
- Existing SNU logo is the brand anchor.

## Tokens
- Page paper: `#f3efe7`
- Surface paper: `#fbfaf6`
- Ink navy: `#17253f`
- Deep ink: `#101a2d`
- Oxblood accent: `#8d2d3d`
- Brass detail: `#b08b46`
- Rule: `#d7d0c3`
- Body: `#1b2230`

Accent should remain rare. Never replace these with the usual teal/green, purple/indigo, or blue-cyan AI palettes without owner approval.

## Hard bans
- No dominant green.
- No gradients, glassmorphism, aurora/blob backgrounds, or gradient text.
- No oversized radius; product surfaces use 0–3px. Pills are only for genuine tags/status.
- No shadow on every surface; default is no shadow.
- No colored left/right stripe on rounded cards.
- No repeated icon-in-rounded-square tiles.
- No identical three/four-card SaaS grids when a list, rule, or asymmetric composition is clearer.
- No emoji icons, invented metrics, placeholder claims, or generic hype copy.
- No decorative motion. Motion communicates state only, 150–250ms, transform/opacity only.
- No new UI/font/icon dependency without explicit justification and performance review.

## Accessibility and performance
- WCAG AA contrast; visible `:focus-visible`; logical focus order; semantic landmarks.
- Respect `prefers-reduced-motion`.
- Minimum practical touch target about 42px.
- Use shipped assets and system font fallbacks; no render-blocking font call.
- A home dashboard may make at most 2 initial data requests. Current target is 1 bounded request, maximum 6 courses.

## Required workflow for any visual change
1. Read this file and `PROJECT_CONTEXT.md`.
2. Inspect real source and render pixels when possible. State clearly when visual inspection is unavailable.
3. Audit for the hard bans before editing.
4. Preserve behavior, routing, data flow, RLS assumptions, accessibility, and request budgets.
5. Render desktop and mobile; compare hierarchy and information density, not just colors.
6. Re-audit after implementation and fix every P0 AI tell.
7. Update `PROJECT_CONTEXT.md` in the same commit and record the evidence from builds/screenshots.

## Research references
- `kevingeary/gearyco-agentic-web-design/agent-docs/design.md`
- `funboy322/avoid-ai-design/SKILL.md`
- `nexu-io/open-design/craft/anti-ai-slop.md`
- HarvardSites accessibility guidance and official higher-education portal patterns reviewed on 2026-09-17.
