# TrustDesk — AI Support Operations Console

TrustDesk is an AI-first customer-support product built around a single promise:
**every AI decision is grounded, policy-checked, approval-gated, and auditable.**
An agent triages a ticket, drafts a reply grounded in the knowledge base with
citations, and proposes a tool action (refund review, replacement order); a
manager approves and executes it; and every step is captured in a deterministic,
replayable run trace. The adversarial path is first-class — prompt-injection and
jailbreak attempts are scanned, quarantined, and escalated, never executed.

> This repository implements the capstone in
> [`TRUSTDESK_PROBLEM_STATEMENT.md`](TRUSTDESK_PROBLEM_STATEMENT.md). The
> original language-agnostic pack (data files, API/data/eval guides, optional
> Python utilities) lives under [`docs/`](docs/) and [`data/`](data/).

## Contents

- [Architecture](#architecture)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Seeding & provisioning](#seeding--provisioning)
- [Running evaluations](#running-evaluations)
- [API reference](#api-reference)
- [Guardrails & security](#guardrails--security)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Known limitations](#known-limitations)
- [Repository layout](#repository-layout)

## Architecture

```
┌────────────┐      /api (JWT)      ┌──────────────────────────────────────┐
│  Client    │  ───────────────▶   │  Express API (server/)                │
│  React+Vite│                     │                                        │
│  (nginx in │   ◀───────────────  │  auth · tickets · documents            │
│   prod)    │     JSON            │  agent-runs · tool-actions · eval-runs │
└────────────┘                     │  analytics · users · notifications     │
                                   │                                        │
                                   │  ┌── pipeline ──────────────────────┐  │
                                   │  │ input scan → retrieval (+quaran-  │  │
                                   │  │ tine) → policy engine → prompt →  │  │
                                   │  │ provider → output guard → trace   │  │
                                   │  └───────────────────────────────────┘ │
                                   └───────────────┬────────────────────────┘
                                                   │
                        ┌──────────────────────────┼───────────────────┐
                        ▼                           ▼                   ▼
                   MongoDB                   LLM provider          in-process
               (tickets, runs,          (mock | anthropic |        job queue
                actions, KB, …)          openai | google | groq)   (evals)
```

- **Rules decide, the model drafts.** A deterministic policy engine computes
  the facts (SLA window, warranty, tier, allowed/denied tools, escalation
  reasons) from the ticket; the model's priority is merged with a policy floor,
  and tool allowlists are enforced server-side regardless of what the model says.
- **Retrieval is Mongo `$text`**, weighted (title 5 / heading 3 / text 1) and
  grouped by document. Untrusted KB content is split into a `quarantined` set
  that never enters the prompt context.
- **The output guard** filters citations to retrieved+trusted docs, injects
  required policy docs, enforces the action allowlist, and blocks leaks, canary
  echoes, and forbidden promises — downgrading to a holding reply + escalation
  when a draft can't be grounded.
- **Tool actions are idempotent** via unique indexes on `idempotency_key` +
  `payload_hash`; approval (`requireRole('manager')`, no self-approval) and an
  executing-lease make request/approve/execute replay-safe.

## Quick start (Docker)

Brings up MongoDB + API + client (nginx) with one command.

```bash
cp .env.example .env
```

Set at minimum `AUTH_JWT_SECRET` (generate with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and
`ADMIN_USERNAME` / `ADMIN_PASSWORD`. Then:

```bash
docker compose up -d --build
```

First-time provisioning (non-destructive, idempotent):

```bash
docker compose run --rm server npm run load-reference
```

```bash
docker compose run --rm server npm run ensure-admin
```

Open the app and log in as the admin manager, then create staff via the Users
admin screen:

```bash
open http://localhost:8080
```

Optional — load the demo dataset (8 tickets, customers, demo users) for a
populated walkthrough. **Destructive** (wipes every collection) and refused
under `NODE_ENV=production` unless forced:

```bash
docker compose run --rm -e NODE_ENV=development server npm run seed
```

Stop with `docker compose down` (data persists in the volume) or
`docker compose down -v` (wipes it).

## Local development

Requires **Node 22+** and a MongoDB instance (the compose `mongo` service, or a
local `mongod`).

```bash
# 1. Mongo (if not already running)
docker compose up -d mongo

# 2. API server
cd server
cp ../.env.example ../.env   # if you haven't already; edit secrets
npm install
npm run seed                 # loads the demo dataset (dev only, destructive)
npm run dev                  # http://localhost:4000, watch mode
```

```bash
# 3. Client (second terminal)
cd client
npm install
npm run dev                  # http://localhost:5173
```

The Vite dev server proxies `/api` to `:4000`, so the browser uses one origin.
Log in with the demo credentials you set in `.env`
(`DEMO_AGENT_PASSWORD` / `DEMO_MANAGER_PASSWORD`; the Login screen has
quick-fill cards).

Fonts (IBM Plex Sans, JetBrains Mono, Material Symbols) are self-hosted via
`@fontsource`, so the console renders fully offline. See
[`client/README.md`](client/README.md) for client-specific details.

## Environment variables

Copy [`.env.example`](.env.example) to `.env` (gitignored) and fill it in. Key
variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables fail-fast secret checks + rate limiting |
| `PORT` | `4000` | API port |
| `MONGODB_URI` | `mongodb://localhost:27017/trustdesk` | `mongodb://mongo:27017/trustdesk` in compose |
| `AUTH_JWT_SECRET` | — | **Required in production** (server won't boot without it) |
| `AUTH_TOKEN_TTL` | `8h` | JWT lifetime |
| `DEMO_*_PASSWORD` | — | Demo account passwords, used only by the destructive seeder |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | Bootstrap manager for `ensure-admin` |
| `LLM_PROVIDER` | `mock` | `mock` \| `anthropic` \| `openai` \| `google` \| `groq` |
| `LLM_API_KEY` / `LLM_MODEL` | — | Required for real providers; base URL is derived |
| `LLM_TIMEOUT_MS` / `LLM_MAX_RETRIES` / `LLM_MAX_TOKENS` | `20000` / `2` / `1024` | Provider call tuning |
| `PROMPT_CANARY` | — | Random 16-char tripwire the output guard scans for |
| `PROMPT_VERSION` | `v1` | Prompt version recorded in the trace |
| `CONFIDENCE_THRESHOLD` | `0.6` | Triage confidence below this forces escalation |
| `SUPPORT_EMAIL_DOMAINS` | — | Comma-separated; exempt from the leak guard |
| `EVAL_CONCURRENCY` | `2` | Parallel eval cases |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s), comma-separated |
| `RATE_LIMIT_*` / `AUTH_RATE_LIMIT_MAX` | `60000` / `300` / `10` | Per-IP limits (off in test) |
| `DATA_DIR` | `../data` | Seed source directory |
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | Client-only; holds no secret |

The default `LLM_PROVIDER=mock` needs no API key and is used for local dev,
tests, and CI. Swap `LLM_PROVIDER` + `LLM_API_KEY` + `LLM_MODEL` to use a real
provider with no code change.

## Seeding & provisioning

| Command (`cd server`) | Destructive? | Purpose |
| --- | --- | --- |
| `npm run load-reference` | No | Loads the KB + tool catalog; idempotent. Safe in production. |
| `npm run ensure-admin` | No | Creates the first manager from `ADMIN_*`; idempotent. |
| `npm run seed` | **Yes** | Drops + reloads every collection with the full demo dataset. Dev/demo only — refused under `NODE_ENV=production` unless forced. |

For production, use `load-reference` + `ensure-admin`, then manage staff through
the Users admin UI. Use `seed` only on throwaway/demo stacks.

## Running evaluations

The eval runner scores the cases in [`data/eval_cases.jsonl`](data/eval_cases.jsonl)
(8 cases covering answer quality, citations, routing, and guardrails) against a
provider.

```bash
cd server
LLM_PROVIDER=mock npm run eval                       # quick, offline
npm run eval -- --provider groq --repeat 3 --out docs/eval/live.json
npm run eval -- --fail-under 1.0                     # CI gate
```

Flags: `--provider`, `--repeat N`, `--out path.json`, `--fail-under X`.
`npm run report` writes [`docs/EVAL_REPORT.md`](docs/EVAL_REPORT.md) from recorded
runs, and `npm run bench` measures API latency while an eval runs (to show the
job queue stays off the request path). See
[`docs/EVALUATION_GUIDE.md`](docs/EVALUATION_GUIDE.md).

## API reference

All routes are under `/api`; everything except `/health*` and `/auth/login`
requires a `Bearer` JWT. Manager-only and auditor-read-only rules are enforced
server-side (the `auditor` role gets 403 on any write).

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health`, `/health/ready` | public | Liveness; readiness (DB state) |
| `POST` | `/auth/login` | public | Exchange credentials for a JWT |
| `GET` | `/tickets` | any | List tickets (paginated) |
| `GET` | `/tickets/:id` | any | Ticket + customer + order (no label fields) |
| `POST` | `/tickets` | agent+ | Create a ticket |
| `POST` | `/tickets/:id/messages` | agent+ | Append a conversation turn (re-scanned) |
| `POST` | `/tickets/:id/triage` | agent+ | Run triage; writes an agent-run |
| `POST` | `/tickets/:id/draft-reply` | agent+ | Generate a grounded, cited draft |
| `GET` | `/tickets/:id/draft` | any | Latest persisted draft |
| `GET` | `/tickets/:id/runs` | any | Agent-runs for a ticket |
| `POST` | `/tickets/:id/send` | agent+ | Send the draft (mock); resolves the ticket |
| `POST` | `/tickets/:id/reopen` | agent+ | Reopen a resolved ticket |
| `GET` | `/documents/search?q=&k=` | any | KB retrieval (trusted + quarantined) |
| `GET` | `/documents/:id` | any | A KB document |
| `GET` | `/agent-runs/:runId` | any | Full deterministic run trace |
| `GET` | `/agent-runs/incidents` | any | Cross-ticket guardrail incident summary |
| `POST` | `/tool-actions` | agent+ | Request an action (idempotent) |
| `GET` | `/tool-actions?ticket_id=` | any | Actions for a ticket |
| `POST` | `/tool-actions/:id/approve` | manager | Approve (no self-approval) |
| `POST` | `/tool-actions/:id/execute` | manager | Execute an approved action (replay-safe) |
| `GET` | `/tool-actions/:id/audit-packet` | any | Signed, byte-stable compliance packet |
| `POST` | `/eval-runs` | agent+ | Start an async eval run (202) |
| `GET` | `/eval-runs`, `/eval-runs/:id` | any | List / poll eval runs |
| `GET` | `/analytics` | any | Ops metrics (deflection, escalation, latency, …) |
| `GET` | `/users` · `POST` `/users` · `PATCH`/`DELETE` `/users/:username` | manager | User & role management |
| `GET` | `/notifications` · `POST` `/notifications/:id/read` · `/notifications/read-all` | any | Human-review queue |

The language-agnostic contract is in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

## Guardrails & security

### Roles

Three roles, enforced **server-side** (the UI also scopes navigation to match,
but that is a convenience — every rule below is checked on the API):

| Capability | `agent` | `manager` | `auditor` |
| --- | :---: | :---: | :---: |
| Read tickets, drafts, runs, documents | ✓ | ✓ | ✓ |
| Triage, draft, reply, send, reopen | ✓ | ✓ | — |
| Request a tool action | ✓ | ✓ | — |
| **Approve & execute** an action | — | ✓ | — |
| Start / view evaluations | ✓ | ✓ | read-only |
| Incidents & analytics dashboards | — \* | ✓ | ✓ |
| Manage users & roles | — | ✓ | — |
| Any write (auditor is read-only everywhere) | ✓ | ✓ | — |

\* Agents can call the analytics/incidents APIs but the UI nav hides those pages
for them (`VIEW_ROLES` in [`client/src/App.jsx`](client/src/App.jsx)); the
dashboards are aimed at managers and auditors. A manager can never approve their
own request (no self-approval), and the `blockAuditorWrites` middleware makes the
auditor role 403 on every write route.

- **JWT auth** with role claims (`agent`, `manager`, `auditor`); 8h tokens;
  `requireAuth` / `requireRole` / `blockAuditorWrites` middleware.
- **Input scanner** runs over customer text only (never system/policy text) and
  flags override, concealment, over-cap coupon, and exfiltration attempts.
- **Quarantine split** keeps untrusted KB docs (e.g. `KB-ADVERSARIAL-001`) out
  of the prompt context — they appear only in the trace's quarantined set.
- **Output guard** enforces citation provenance, the tool allowlist, and
  leak/canary/forbidden-promise checks; unsupported drafts become a holding
  reply + escalation.
- **Idempotency & approval gating** make every tool action replay-safe and
  require a different person to approve than to request.
- Secrets live only in `.env` (gitignored); the production build ships no keys
  (CI greps `client/dist`). `helmet`, CORS allowlist, and per-IP rate limits are
  on in production.

## Testing

```bash
cd server && npm test        # vitest, uses an in-memory MongoDB
cd server && npm run lint     # eslint
cd client && npm run lint     # oxlint
cd client && npm run build    # production build
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs pack validation
→ lint → server tests → a mock eval with `--fail-under 1.0` → client build.

## Design decisions

1. **Rules decide, the model drafts.** Deterministic policy facts and tool
   allowlists gate every action; the model never has final say on priority or
   what tool runs.
2. **Mongo `$text` over a vector store.** Weighted keyword retrieval is
   deterministic, inspectable, and dependency-light for this KB size — the trace
   can show exactly why a doc ranked.
3. **Idempotency via unique indexes**, not application-level locking, so
   duplicate requests/executes collapse to one record under concurrency.
4. **In-process job queue** (`p-limit`) for evals keeps them off the request
   path without adding an external broker.

The UI design system (Material-3 tokens, audit-first light/dark theme) is
documented in
[`docs-user/stitch_trustdesk_ai_operations_console/trustdesk/DESIGN.md`](docs-user/stitch_trustdesk_ai_operations_console/trustdesk/DESIGN.md).

## Known limitations

- The default `mock` provider returns fixed-shape triage/draft output, so some
  eval metrics (e.g. priority accuracy) read below target on the mock baseline
  by design — run a real provider for representative numbers.
- Retrieval is keyword-based (`$text`), not semantic; paraphrased queries that
  share no terms with the KB may rank lower than a vector store would.
- The job queue is in-process and single-node; horizontal scaling would need an
  external queue.
- "Send reply" is a mock (no real email/Slack transport); escalation
  notifications log a mock send.
- Single MongoDB instance; no multi-tenancy.

## Repository layout

```
server/           Express API, services (ai, retrieval, policy, guardrails,
                  tools, evals, analytics, compliance), models, tests
client/           React + Vite SPA (see client/README.md)
data/             KB docs, tickets, customers, orders, tool catalog, eval cases
docs/             API contract, data model, evaluation + implementation guides,
                  eval report
docs-user/        Design artifacts (Stitch UI export, phase breakdown, reviews)
scripts/          Optional Python pack utilities (validate / seed / baseline)
docker-compose.yml  Full local stack (mongo + server + client)
```

See [`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md) for the build
order, demo scenarios, and FAQ.
