# TrustDesk — Web Client

The React single-page app for **TrustDesk**, the AI operations console. It is the
agent/manager/auditor front end over the Express API in [`../server`](../server):
ticket triage, grounded draft replies with citations, approval-gated tool
actions, the deterministic run trace, and the guardrail / incidents / analytics /
evaluation dashboards.

This is the front end only — see the root [`../README.md`](../README.md) for the
full stack, data model, API contract, and how to run everything together.

## Stack

- **React 19** + **Vite 8** (`@vitejs/plugin-react`)
- **Tailwind CSS 3** with a hand-tuned Material-3 token system (light + dark,
  no-flash pre-paint theme script in [`index.html`](index.html))
- **oxlint** for linting
- **Self-hosted fonts** via `@fontsource` — IBM Plex Sans, JetBrains Mono, and
  the variable Material Symbols icon font are bundled by Vite and imported in
  [`src/main.jsx`](src/main.jsx). Nothing is fetched from a CDN at runtime, so
  the console renders fully offline / air-gapped.

## Prerequisites

- Node.js 20+ and npm
- The TrustDesk API running on `http://localhost:4000` (see
  [`../server/README`](../server) / root README for seeding and starting it)

## Develop

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`. Requests to `/api` are proxied
to the API on `:4000` (see [`vite.config.js`](vite.config.js)), so the browser
talks to a single origin and no API base URL is needed in development.

Log in with the seeded demo accounts (the Login screen has quick-fill cards):

- **agent** — triage, draft, request actions
- **manager** — everything, including approve / execute and user admin
- **auditor** — read-only oversight (if seeded)

Credentials come from the server's seed step; see the root README.

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

### Pointing the build at a remote API

In development, `/api` is proxied. For a static deployment where the API lives
on another origin, set `VITE_API_BASE_URL` at build time:

```bash
VITE_API_BASE_URL=https://api.example.com/api npm run build
```

It defaults to `/api` when unset (see [`src/api.js`](src/api.js)). A matching
`CORS_ORIGIN` must be configured on the server.

## Lint

```bash
npm run lint      # oxlint
```

## Docker

[`Dockerfile`](Dockerfile) builds the client and serves `dist/` with nginx
([`nginx.conf`](nginx.conf)). The root `docker-compose.yml` wires the client,
server, and MongoDB together for one-command startup.

## Layout

```
src/
  api.js               fetch wrapper: attaches the JWT, maps error codes to messages
  App.jsx              top-level routing + role-scoped navigation
  theme.js             light/dark token helpers
  pages/               Login, Workspace, Approvals
  components/          TicketQueue, TicketDetail, TriageCard, DraftPanel,
                       ActionPanel, TraceDrawer, EvalView, AnalyticsView,
                       GuardrailDashboard, UsersAdmin, SecurityPanels, ...
  components/shell/    Header, Footer, NotificationsBell
  index.css            Material-3 token system + component styles
  main.jsx             entry point; imports the self-hosted fonts
```

Security note: the UI hides controls a role may not use, but every write is
enforced server-side — the client is not a security boundary.
