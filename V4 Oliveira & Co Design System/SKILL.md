---
name: v4-oliveira-design
description: Use this skill to generate well-branded interfaces and assets for V4 Company | Oliveira & Co (a V4 Company franchise unit in Brazil), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, brand colors (V4 red #e50914 + neutrals), Montserrat type, official V4 logos, and UI kit components for the Unit BI Dashboard.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key starting points:
- `colors_and_type.css` — drop-in design tokens (CSS custom properties)
- `assets/v4-simbolo.webp`, `assets/v4-logo-completa.webp` — official V4 logos (from brand.v4company.com)
- `ui_kits/bi-desktop/` — reference for the BI dashboard surface
- `ui_kits/bi-mobile/` — reference for mobile companion
- `slides/` — monthly-review deck template

Brand essentials at a glance:
- Primary red: `#e50914` (don't change the tone)
- Dark surfaces: `#0d0d0d` / `#1a1a1a` / `#262626`
- Type: Montserrat (display, official) + Inter (body, substitute for Proxima Nova)
- Voice: Portuguese-BR default, direct + results-first, "nós/você", no emoji in product UI
- No gradients, no drawn SVG, no emoji in product surfaces — solid colors, real assets only
