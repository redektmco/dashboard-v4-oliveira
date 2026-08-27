# BI Desktop · Oliveira & Co

The primary product of the design system: a desktop web BI dashboard for the entire unit team.

## Run
Open `index.html` directly. It is fully static — React + Babel are loaded from CDN.

## Structure
```
bi-desktop/
├── index.html         ← entry, App + router
├── styles.css         ← all dashboard styles
├── mock-data.js       ← V4Data global (kpis, clients, squads, pipeline, etc)
├── components.jsx     ← Icon, Avatar, KPITile, Card, Sparkline, BarChart, Donut, HealthRing, badges
├── Sidebar.jsx
├── Topbar.jsx
├── Overview.jsx       ← /
├── ClientTable.jsx    ← used in / and /clients
└── ClientDetail.jsx   ← /clients/:id
```

## Routes implemented
- **Visão geral** — KPI row, 12-month faturamento bar chart, health distribution, pipeline funnel, carteira preview, Método V4 donut, alerts, weekly agenda.
- **Carteira de clientes** — full sortable + filterable table.
- **Cliente (drill-in)** — per-client KPIs, trends, squad, health factors, timeline.

Other routes (Squads, Campanhas, Pipeline, Financeiro, Agenda) are stubbed; the components are ready — just compose them per surface.

## Click-through to try
1. Land on **Visão geral** (default).
2. Click **Carteira de clientes** in the sidebar (or any row in the overview's client table preview).
3. Click any client row to drill into **Cliente** detail.
4. Use the chip filters (Todos / Saudáveis / Em risco / Críticos) and column headers (Fee / Invest. / ROAS / LTV / Health) to sort.

## Design notes
- Default dark theme. Red used only as accent.
- Critical rows get a 2px left red border + a 6% red horizontal gradient — the one place red bleeds into a surface, because the urgency is the point.
- All KPI numerals use `font-variant-numeric: tabular-nums` and the Montserrat display family for tight numerical rhythm.
- Method V4 pillars are encoded with the dataviz palette (red/yellow/green/gray).

## Known stubs / next iteration
- "Novo cliente" / "Exportar" / kebab menus are visual only.
- The Health Score formula is invented — replace with Oliveira & Co's actual formula in `components.jsx → HealthFactors`.
- Search input is non-functional.
- Notification dropdown does not open.
