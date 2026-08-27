# V4 Oliveira & Co — Design System

Design system for **V4 Company | Oliveira & Co** — a franchise unit (*unidade*) of [V4 Company](https://v4company.com), the largest digital-marketing advisory franchise in Brazil. This repo is purpose-built around the **Unit BI Dashboard**: an internal, full-team-visible board that consolidates information about every client the unit manages.

> "Nosso negócio é vender o seu." — V4 Company

---

## Context

**V4 Company** is a Brazilian *assessoria de marketing digital* founded in 2012 by Dener Lippert, structured as a franchise network with 250+ offices and 7,000+ active clients across Brazil. Each franchise unit is run as a partner business and follows the **Método V4**: the 4-pillar framework of **Aquisição, Engajamento, Monetização e Retenção**.

**Oliveira & Co** is one of those units. The Unit BI is for the **internal team** — sales, gestores de tráfego, CS, squads, leadership — to see every client's health, fee, investment, performance and squad on a single transparent board, and to drill into any client.

### Primary product
- **Unit BI Dashboard** (desktop web, primary) — internal command center
- **Mobile companion** — read-only check-ins on the go
- **Monthly review slide deck** — exportable presentation for unit retrospectives

### Audience
The **entire unit team** has access. Not a leadership-only console — designed for transparency.

### Sources used to build this system
| Source | URL | What we pulled |
|---|---|---|
| V4 Brand Book — Logo | https://brand.v4company.com/identidade-visual/logo | Símbolo, símbolo+company, logotipo completo; usage rules; "coisas a evitar" |
| V4 Brand Book — Cores & Tipografia | https://brand.v4company.com/identidade-visual/cores-e-tipografias | Full color hex values; Montserrat as primary type; H1–H4 spec |
| V4 Company site | https://v4company.com | Tone of voice, slogan, Método V4 framework |
| LinkedIn / blog | linkedin.com/company/v4companysa, v4company.com/blog | Vocabulary ("4 venderes", "cientistas do marketing"), positioning |

> The reader may or may not have access to these sources. URLs are recorded so the brand can be re-verified.

---

## Content fundamentals

### Tone of voice
- **Portuguese-Brazilian as the default**, English available as a bilingual toggle (per stakeholder requirement). All copy in the UI kit is dual-source so we can swap.
- **Direct, results-first, slightly aggressive.** V4 doesn't hedge. Sentences are short. The brand talks about *vender*, *resultado*, *crescer*, *performance*, *método*.
- **First-person plural ("nós") + second-person ("você")** — V4 speaks AS a partner TO the client/team member. Inside a unit's internal tool, lean even more on "nós": *"nosso pipeline"*, *"nosso faturamento"*, *"nossos clientes"*.
- **No emoji in product UI.** Brand content occasionally uses them on social, but the BI is a serious operational tool — emoji read as toy. Status uses semantic color + word, not faces.
- **Sentence case for everything**, except the brand wordmark and the section eyebrows (small caps / UPPERCASE with letter-spacing, like "MÉTODO V4").
- **Numbers are sacred.** V4 self-describes marketing as "uma ciência exata, mensurável e analisável de forma matemática" — the BI must treat numbers as first-class citizens: tabular alignment, monospace where helpful, currency always with R$ prefix and BR locale formatting (`R$ 12.450,00`).

### Vocabulary cheat sheet (PT)
| Term | Meaning in V4 context |
|---|---|
| **Cliente** | Account being managed by the unit |
| **Fee** | Monthly recurring fee the client pays the unit |
| **Investimento** | Ad spend the client invests via the unit (Meta + Google + etc) |
| **Squad** | The team assigned to the client (gestor de tráfego, copy, design, CS) |
| **Health Score** | Composite 0–100 of client health (used heavily — primary KPI) |
| **LTV** | Lifetime value of the client to the unit |
| **CAC / ROAS** | Customer Acquisition Cost / Return On Ad Spend |
| **Faturamento** | Revenue (the unit's, or the client's) |
| **Reunião** | Meeting (1-on-1 client, weekly team, monthly review) |
| **Pipeline** | Sales pipeline for new clients into the unit |
| **Método V4** | The 4-pillar framework (Aquisição / Engajamento / Monetização / Retenção) |
| **Assessor** | A V4 specialist on a squad |

### Example copy
- ✅ **"Health score do mês"** (not "Pontuação de saúde do cliente neste mês")
- ✅ **"3 clientes em risco. Olhar agora →"**
- ✅ **"R$ 482.300 em fee ativo"**
- ✅ **"Squad da Oliveira: 12 assessores"**
- ❌ "Bem-vindo de volta! 😊 Confira sua saúde de cliente!"

---

## Visual foundations

### Palette
**Brand-true and restrained.** The full V4 red palette + brand neutrals (light + dark stops) come straight from the brand book.

| Token | Hex | Use |
|---|---|---|
| `--v4-red-500` | `#e50914` | Brand accent. CTAs, focus rings, critical status, brand surfaces |
| `--v4-red-600/700/900` | `#b20710` / `#80050b` / `#400306` | Press states, deep accents, dataviz darks |
| `--v4-black` → `--v4-gray-700` | `#000` → `#333` | Dark surfaces |
| `--v4-gray-300` → `--v4-white` | `#b3b3b3` → `#fff` | Foreground text |
| `--v4-green` | `#52cc5a` | Healthy / on-track |
| `--v4-yellow` | `#ffc02a` | At risk / warning |

The BI defaults to **dark theme** (`--bg: #0d0d0d`). The brand book uses dark surfaces with red as accent throughout V4 marketing material; mirroring it gives data viz strong contrast without the dashboard feeling like a website. Red is reserved for **brand moments + critical status only** — it's never a chart background or a panel fill.

### Typography
- **Display / headings: Montserrat** (the brand book lists Montserrat with all weights as a brand font and provides it as a download — we load from Google Fonts at 300–900).
- **Body / UI: Inter** — **substitution for Proxima Nova** (brand H1–H4 spec). Proxima Nova is a commercial font; Inter is the closest free analogue (same Grotesque family, designed for screen UI, ships tabular-nums). **🟡 Flagged for the user**: if Oliveira & Co holds a Proxima Nova license, drop the .woff2 into `fonts/` and replace `--font-body`.
- **Mono: JetBrains Mono** — for IDs and code-style numerics in tables.
- Brand book H1=72 / H2=60 / H3=22 / H4=18; we use those exact sizes for the slide deck and a denser scale for in-app BI (H1=28).

### Layout
- **Density: medium.** BI dashboards must show many numbers without feeling cramped. 12-column grid, 24px gutter, panel padding 20–24px.
- **Persistent left rail nav** (icons + labels), fixed top bar (search + unit/period switcher + user), main content scrolls.
- **Mobile**: bottom tab bar, single-column stacks. Hero KPIs collapse to a 2×2 grid.

### Backgrounds, surfaces, depth
- **No gradients** as backgrounds (brand book forbids gradient logo fills, and the V4 aesthetic is flat). Surfaces are **solid colors** with 1px borders at `rgba(255,255,255,0.08)`.
- **No imagery as background.** No noise textures. Charts and numbers carry the visual weight.
- **Cards**: `border-radius: 12px`, 1px `--border`, fill `--bg-elev-1`, optional 2px–4px **left accent bar** in red **only for the "in crisis" client cards** — this is the one place we let red bleed into the surface, because urgency is the point.
- **Logo "moldura" pattern**: the V4 logo is a rounded square. Use 12px corner radius (`--radius-lg`) on all major panels as a quiet echo.

### Borders / dividers
- 1px solid `rgba(255,255,255,0.08)` as default. `0.14` for stronger separation around primary surfaces. Never use thick borders.
- Tables: horizontal row dividers only, no vertical lines.

### Shadows
- Dark theme = **minimal drop shadow**. Cards use a 1px inner highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`) for crispness, not a glow.
- Reserved for floating UI: menus, modals, tooltips use `--shadow-2`. Only the focused red CTA gets a `--shadow-red-glow` accent.

### Motion
- **Fast, no bounce.** Default duration 200ms, ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`). No spring physics, no overshoot. V4's brand reads "matemático" — animations should feel snappy and deliberate, not playful.
- Hover: 120ms opacity/color shift only.
- Page transitions: 200ms fade + 4px upward translate. No slide-in cards or staggered reveals.

### Hover & press states
- **Hover**: lighten background by one elevation stop (`--bg-elev-1` → `--bg-elev-2`), or shift text from `--fg-2` to `--fg`.
- **Press**: drop one stop AND nudge `transform: translateY(1px)` on solid buttons. Red CTA presses to `--accent-press` (`#80050b`).
- **Active/selected**: 2px left accent (red) on nav items + filled red dot on tabs.

### Corner radii
- 4 / 8 / 12 / 16 px. Pill (999) for filter chips + status badges only.

### Transparency / blur
- Used sparingly. Top bar uses `backdrop-filter: blur(20px)` against `rgba(13,13,13,0.7)` when content scrolls under it. **No frosted panels everywhere** — V4 is solid and direct.

### Imagery
- Real product imagery is **cool, dark, contrast-pushed** — photos of teams, screens, events with deep blacks and high saturation. The BI app itself doesn't ship photography (it's all data) but the **slide deck template uses full-bleed dark photos with red graphic overlays**.

---

## Iconography

V4's brand book does not ship an official icon system. The visual identity is logo-led + typographic; product UI icons are not defined.

**Approach for this design system:**
- We use **[Lucide](https://lucide.dev)** (via CDN: `https://unpkg.com/lucide@latest`) as the BI icon set. **🟡 Flagged substitution.** Lucide is chosen because:
  - Free, MIT-licensed
  - **1.5px stroke** style matches the lean, geometric feel of the V4 symbol's negative-space cuts (the V4 mark itself is made of straight knife cuts in a rounded box)
  - Covers every BI primitive we need (chart icons, status, navigation)
- Icon size: **16px** in body/table, **20px** in nav, **24px** in section headers, **48px** for empty states.
- Icon color follows text color (`currentColor`). The red accent is used on icons only for status (critical) and the brand logo itself.
- **No emoji in UI.** No Unicode-as-icon hacks. No drawn SVGs in components (except the logo).

If Oliveira & Co prefers a different set later (Heroicons, Phosphor, Tabler) the swap is a single CDN URL change.

---

## Components

Exported, importable React components (compiled into `_ds_bundle.js`, `window.V4OliveiraCoDesignSystem_e5d2e0.<Name>`):

- **Sidebar** — left rail nav (`ui_kits/bi-desktop/Sidebar.jsx`)
- **Topbar** — breadcrumbs + search + period switcher (`ui_kits/bi-desktop/Topbar.jsx`)
- **Overview** — dashboard home page (`ui_kits/bi-desktop/Overview.jsx`)
- **ClientTable** — sortable/filterable client list (`ui_kits/bi-desktop/ClientTable.jsx`)
- **ClientDetail** — client page (Resumo · Dossiê · Reuniões · Pesquisa tabs) (`ui_kits/bi-desktop/ClientDetail.jsx`)
- **ClientDossie** — editable realtime client dossier (`ui_kits/bi-desktop/ClientDossie.jsx`)
- **ClientMeetings** — meeting log + composer (`ui_kits/bi-desktop/ClientMeetings.jsx`)
- **SquadPerformance** — squad performance card (`ui_kits/bi-desktop/SquadPerformance.jsx`)
- **Identity** — identity gate + presence avatars (`ui_kits/bi-desktop/Identity.jsx`)
- **App** — mobile companion app, 4 screens (`ui_kits/bi-mobile/App.jsx`)

## File index

```
.
├── README.md                  ← you are here
├── SKILL.md                   ← cross-compatible Agent Skill definition
├── colors_and_type.css        ← design tokens (single source of truth)
├── data/                      ← ⭐ DADOS — onde colocar os números reais (JSON editável)
│   ├── README.md              ← guia de como conectar dados reais + schema completo
│   ├── unit.json              ← KPIs da unidade (fee, ROAS, faturamento, churn…)
│   ├── clients.json           ← carteira de clientes
│   ├── squads.json            ← squads + líderes + ocupação
│   ├── trend.json             ← faturamento 12 meses
│   ├── pipeline.json · meetings.json · metodo.json
├── fonts/                     ← (uses Google Fonts via @import; no local woff2 yet)
├── assets/
│   ├── v4-simbolo.webp        ← V4 symbol (red rounded square)
│   ├── v4-simbolo-company.webp
│   └── v4-logo-completa.webp  ← "V4 COMPANY" wordmark
├── preview/                   ← Design System tab cards
├── ui_kits/
│   ├── bi-desktop/            ← Primary BI dashboard
│   │   ├── README.md
│   │   ├── index.html         ← Interactive demo
│   │   └── *.jsx              ← Component sources
│   └── bi-mobile/             ← Mobile companion
│       ├── README.md
│       ├── index.html
│       └── *.jsx
└── slides/                    ← Monthly review deck template
    ├── index.html
    └── *.jsx
```

---

## 🟡 Caveats / open questions
1. **Proxima Nova substitution.** Brand book H1–H4 specifies Proxima Nova; we substitute Inter. Drop Proxima Nova .woff2 files in `fonts/` and update `--font-body` if licensed.
2. **No official icon system from V4.** Using Lucide as a substitute. Confirm or swap.
3. **Bebas Neue + Morganite** are listed as brand fonts but no usage guidance is given in the brand book. Not used in this system; flagged for follow-up if there's a known role.
4. **Dados são placeholder, mas EDITÁVEIS.** Os números de clientes, squads e métricas vivem em arquivos JSON na pasta **`data/`** — abra, edite o valor, recarregue. O Health Score usa a fórmula de 12 dimensões da pesquisa mensal (ver `ui_kits/bi-desktop/health-score.js`). Para conectar dados reais (Meta Ads, CRM, planilhas), siga o guia em `data/README.md`. Dossiês, reuniões e identidade de usuário já são editáveis pela própria UI e persistem no navegador (`store.js`).
