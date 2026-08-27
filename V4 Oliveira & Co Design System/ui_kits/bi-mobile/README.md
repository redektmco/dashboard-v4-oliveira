# Mobile companion · V4 Oliveira & Co

Read-only-ish mobile view of the Unit BI for on-the-go check-ins. Designed as an iOS app inside a device frame.

## Screens
- **Visão geral** — health médio, fee, faturamento + alerts feed
- **Clientes** — searchable list, color-coded health, swipe-to-open
- **Cliente** — single-client snapshot: health ring, fee, ROAS, squad, próxima reunião
- **Notificações** — crises, novas reuniões, oportunidades

## Stack
- React + Babel, single `App.jsx`
- iOS device frame from `starter:ios_frame.jsx`
- Shared design tokens from `../../colors_and_type.css`
- Reuses mock data shape from `../bi-desktop/mock-data.js` (duplicated locally for portability)
