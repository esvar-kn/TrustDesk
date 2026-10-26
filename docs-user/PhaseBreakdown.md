# TrustDesk — Internal Phase Breakdown

Each of the 7 plan phases, split into internally sequenced sub-phases. Every sub-phase
has a mini-goal and a verification step, ordered so each is checkable before the next.
Time estimates sum to each phase's budget from the implementation plan (~43 h total).

Legend: ✅ = verification / done-check.

---

## Phase 1 · Environment & Data Platform (~5.5 h · Sun 25 – Mon 26 Oct)

**Goal:** seeded MongoDB, demo login, read-only ticket APIs.
**Milestone:** `GET /api/tickets/tkt_9001` returns ticket + customer + order, no label fields.

### 1.0 · Project skeleton & tooling (~45 min)
- `server/` with `express`, `mongoose`, `zod`, `pino`, `jsonwebtoken`, `bcryptjs`, `dotenv`.
- `client/` via `npm create vite@latest client -- --template react`.
- `config/env.js` (Zod-validated), `db/connect.js`, `app.js`/`server.js`, `GET /api/health`.
- ESLint (flat config) + Prettier.
- ✅ `node src/server.js` boots; `curl /api/health` → `{ ok: true }`.

### 1.1 · Mongo + Docker up (~30 min)
- `docker-compose.yml` with `mongo:8`; `.env.example` with every key.
- Wire `db/connect.js` into startup.
- ✅ `docker compose up -d mongo`; server logs "connected".

### 1.2 · Data models (~45 min)
- One file per collection: `customers`, `orders`, `tickets`, `knowledge_documents`,
  `kb_chunks`, `seed_labels`, `users`.
- **Constraint:** `tickets` schema has **no `expected_*` fields**.
- ✅ Models import; unique indexes declared as planned.

### 1.3 · KB parser (~45 min)
- `seed/parseKb.js`: parse `Doc ID:`/`Audience:`/`Version:`, title from `#`, sha256 checksum,
  one chunk per `##` section; audience allowlist → `trust_level`.
- ✅ ~25 chunks; only `KB-ADVERSARIAL-001` marked untrusted.

### 1.4 · Seeder (~45 min)
- `seed/seed.js`: drop + reload; move `expected_*` into `seed_labels`; create `agent` + `manager`
  with bcrypt hashes.
- ✅ `mongosh` one-liner → `{ t: 8, c: 25, leak: 0, untrusted: ['KB-ADVERSARIAL-001'] }`.

### 1.5 · Auth (~45 min)
- `POST /api/auth/login` → 8 h JWT with `role`; `requireAuth` (401), `requireRole('manager')` (403).
- Central error handler, `{ error: { code, message, details } }` + status map.
- ✅ Login returns token; protected route without token → 401.

### 1.6 · Ticket read APIs + milestone (~45 min)
- `GET /api/tickets`, `GET /api/tickets/:id` (ticket+customer+order), `POST /api/tickets` (verbatim).
- ✅ List → 8; `tkt_9001` → `{ tier: "gold", until: "2026-07-01", leak: false }`.

**Flow:** `1.0 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6` · **Commit points:** after 1.4, after 1.6.

---

## Phase 2 · Retrieval & Policy Engine (~7 h · Tue 27 – Wed 28 Oct)

**Goal:** deterministic retrieval + per-ticket policy facts, both unit-tested.
**Milestone:** every `must_cite_doc_ids` ranks top-3 on subject+body; adversarial doc never in a context set.

### 2.0 · Date utilities (~1 h)
- `policy/dates.js`: ISO parse with offsets, `daysBetween`, `addMonths`, `businessDaysBetween`,
  `addBusinessDays`, `endOfDay` (IST).
- ✅ Boundary unit tests (23:59 IST on last window day; `+05:30` offsets).

### 2.1 · Retriever core (~1.5 h)
- `retrieval/retriever.js`: `$text` with `{ score: { $meta: 'textScore' } }`, group chunks by
  `doc_id` (max score), return `doc_id`, `title`, `snippet`, `score`, `trust_level`.
- Weighted text index: title 5, heading 3, text 1.
- ✅ A search returns ranked chunks grouped by doc.

### 2.2 · Query builder (~1 h)
- `retrieval/queryBuilder.js`: subject + body + order-derived terms (item category; `final sale
  software license` when final_sale; `tracking delivery` when in_transit) + `gold` when gold tier.
- Customer text used only as search terms, never as instructions.
- ✅ `eval_001` / `eval_003` rankings improve with order terms.

### 2.3 · Category boost + quarantine split (~1 h)
- Category→doc map built from document titles at ingest (never from eval labels); ×1.5 boost.
- Split results into `context` (trusted) and `quarantined` (untrusted); both into the trace.
- ✅ `KB-ADVERSARIAL-001` appears only in `quarantined`, never `context`.

### 2.4 · Document routes (~0.5 h)
- `GET /api/documents/search?q=&k=`; `POST /api/documents/ingest` (manager; upsert by `doc_id`, rebuild chunks).
- ✅ `search?q=left earbud cracked replacement` → top doc `KB-REFUND-001`.

### 2.5 · Policy engine (~1.5 h)
- `policy/policyEngine.js`: facts, allowed/denied tools, priority floor, escalation reasons
  (plan §3.1). Uses ticket `created_at` as "now", never `Date.now()`.
- Merge rules: final priority = max(model, floor); escalate = model OR any reason; category = hint when set.
- ✅ All 8 tickets produce the §3.1 facts.

### 2.6 · Policy + retrieval tests (~0.5 h)
- Policy tests under `vi.setSystemTime('2031-01-01')`; retrieval regression (8/8 top-3).
- ✅ `npm test -- retrieval policy` green; 8/8 must-cite in top-3, ≥7/8 at rank 1.

**Flow:** `2.0 → 2.1 → 2.2 → 2.3 → 2.4`, `2.5` parallel after 2.0, both → `2.6`.
**If behind:** drop category boost + ingest endpoint; keep order-derived query terms.

---

## Phase 3 · AI Core & Evals v1 (~13 h · Thu 29 – Sat 31 Oct) — *largest phase*

**Goal:** triage + cited drafts through one guarded, traced pipeline, measured by an eval runner.
**Milestone:** `npm run eval` (mock) completes all 8 cases; one live run recorded.

### 3.0 · Provider interface + mock + schemas (~2 h)
- `ai/provider.js` factory (picks from `LLM_PROVIDER`); `ai/mockProvider.js` keyword rules (no label access);
  `ai/schemas.js` Zod `TriageOut` + `DraftOut`.
- ✅ Mock returns schema-valid triage + draft JSON.

### 3.1 · Provider adapters — OpenAI-compatible + Anthropic (~2 h)
- `ai/openaiCompatible.js`: `openai` SDK with `baseURL` derived from `LLM_PROVIDER`
  (`getProviderBaseUrl`, override via `LLM_BASE_URL`), `response_format: json_object`, temp 0,
  `AbortController` timeout, 2 retries on 429/5xx with backoff + jitter, honor `retry-after`.
  Covers OpenAI, Google (Gemini) and Groq.
- `ai/anthropic.js`: `@anthropic-ai/sdk` behind the same `complete()` interface — `system` top-level,
  JSON via structured output, same timeout/retry. (Anthropic is not OpenAI-compatible.)
- ✅ A live call on each configured provider returns parsed JSON within timeout; swapping
  `LLM_PROVIDER` + `LLM_API_KEY` changes provider with no code change.

### 3.2 · Prompts (~1.5 h)
- `prompts/triage.v1.js`, `prompts/draft.v1.js`: rules + priority rubric + canary; tagged blocks
  (`<facts>`, `<customer_message>`, `<policy_doc id>`, `<scanner_flags>`) labelled as data.
- ✅ Rendered prompt contains no `expected_*` text, no adversarial-doc sentence.

### 3.3 · Guardrails (~2 h)
- `guardrails/patterns.js`, `inputScanner.js` (customer text only), `outputGuard.js` (`guardDraft`:
  citation filter, required-doc inject, action allowlist, leak/canary check, forbidden-promise, unsupported→escalate).
- ✅ Scanner flags `tkt_9005`–`9007`; guard drops untrusted citation, blocks `issue_coupon`.

### 3.4 · Triage service (~1.5 h)
- `triage/triageService.run(ticketId)`: pipeline + policy merge; writes one `agent_runs` doc always.
- ✅ `tkt_9001` → `{ category: refund, priority: medium, should_escalate: false, run_id }`.

### 3.5 · Draft service (~2 h)
- `drafts/draftService.run(ticketId)`: retrieval → policy → prompt → guard → trace; one repair call on
  schema/promise failure, then holding reply + escalate.
- ✅ `tkt_9006` → citations include `KB-SECURITY-001`, actions `["escalate_to_human"]`.

### 3.6 · AI routes (~1 h)
- `POST /api/tickets/:id/triage`, `/draft-reply`; `GET /api/agent-runs/:runId`, `/api/tickets/:id/runs`.
- ✅ Trace returns `retrieved_doc_ids`, `quarantined_doc_ids`, `guardrail_results`, `status`.

### 3.7 · Eval runner v1 (~1 h)
- `evals/evalRunner.js`, `metrics.js`, `requirementChecks.js`; CLI `scripts/run-evals.js`
  (`--provider`, `--repeat`, `--out`).
- ✅ `LLM_PROVIDER=mock npm run eval` → metric table, 8/8 complete; one live `--out docs/eval/live-v1.json`.

**Flow:** `3.0 → 3.1`/`3.2`/`3.3` (parallel) → `3.4 → 3.5 → 3.6 → 3.7`.
**Pass mark (live):** unsafe-action block rate 1.0, citation coverage 1.0. Triage misses OK here.
**If behind:** demo on mock (documented); keep live adapter for one recorded run.

---

## Phase 4 · Approval-Gated Tool Action (~6 h · Sun 1 Nov)

**Goal:** `create_replacement_order` end-to-end with manager approval + idempotency; evals off the request path.
**Milestone:** a duplicated request and a duplicated execute each produce exactly one record.

### 4.0 · Tool registry (~1 h)
- `tools/registry.js`: load `tool_catalog`; check existence, required fields, allowed categories, `max_amount_inr`.
- ✅ Unknown tool / missing field / over-cap each rejected with the right code.

### 4.1 · Tool action service — `request` (~1.5 h)
- Validate → policy allowlist → payload matches ticket → create with unique `idempotency_key` + `payload_hash`.
- ✅ 10 parallel identical requests → 1 action (one insert wins, nine replay); different payload → 409.

### 4.2 · `approve` + `execute` (~1.5 h)
- `approve`: `requireRole('manager')`, block self-approval, `approvals.action_id` unique.
- `execute`: executing-lease (60 s), executor keyed on `idempotency_key`.
- ✅ Execute before approval → 409; agent approve → 403; double execute → 1 record.

### 4.3 · Executors (~1 h)
- `executors/replacementOrder.js` (must-have), `executors/refundReview.js` (covers `tkt_9008`).
- ✅ Replacement insert keyed on `idempotency_key`; second execute returns the existing row.

### 4.4 · Tool routes (~0.5 h)
- `POST /api/tool-actions`, `GET /api/tool-actions?ticket_id=`, `/:id/approve`, `/:id/execute` (manager).
- ✅ The plan's full curl sequence passes; `replacement_orders` count = 1.

### 4.5 · Job queue + async evals (~0.5 h)
- `jobs/jobQueue.js` with `p-limit(EVAL_CONCURRENCY)`; `POST /api/eval-runs` → 202; `GET /api/eval-runs/:id`, list.
- ✅ `POST /api/eval-runs` → 202; `GET /api/tickets` still fast during a run.

**Flow:** `4.0 → 4.1 → 4.2 → 4.3 → 4.4`, `4.5` independent.
**If behind:** skip `refundReview.js` + listing route; replacement flow alone covers must-have.

---

## Phase 5 · Frontend & Demo Flow (~3.5 h · Mon 2 Nov)

**Goal:** one screen walking the seven-step demo flow.
**Milestone:** full flow runs in under 5 minutes without curl.

### 5.0 · API client + login (~0.5 h)
- `client/src/api.js` fetch wrapper (adds token, maps `error.code`); `pages/Login.jsx`.
- ✅ Login as agent / manager; token stored.

### 5.1 · Workspace + ticket queue (~0.75 h)
- `pages/Workspace.jsx` (queue left, detail right, Trace/Evals tabs); `components/TicketQueue.jsx` with triage badges.
- ✅ All 8 tickets listed with category/priority badges.

### 5.2 · Ticket detail + triage (~0.5 h)
- `TicketDetail.jsx` (message, tier, verification, order dates), `TriageCard.jsx`.
- ✅ Triage button populates the card.

### 5.3 · Draft panel (~0.75 h)
- `DraftPanel.jsx`: body, citation chips → chunk snippet, red guardrail-flag banner, escalation state.
- ✅ `tkt_9006` shows flags banner + escalation.

### 5.4 · Action panel (~0.5 h)
- `ActionPanel.jsx`: recommended actions, prefilled payload + deterministic idempotency key; approve/reject/execute
  visible to manager only.
- ✅ Agent sees no approve button; manager completes the flow.

### 5.5 · Trace drawer + eval view (~0.5 h)
- `TraceDrawer.jsx` (formatted run JSON); `EvalView.jsx` (run button, 2 s polling, metric + per-case tables).
- ✅ Client build; `grep -rE "gsk_|AIza" client/dist` prints nothing; demo for `tkt_9001/9006/9007` runs.

**Flow:** `5.0 → 5.1 → 5.2 → 5.3 → 5.4 → 5.5`.
**If behind:** raw JSON in a `<pre>` instead of a styled drawer; UI polish is ungraded.

---

## Phase 6 · Tests, Hardening & Eval Report (~3.5 h · Tue 3 Nov)

**Goal:** critical-path tests pass in CI; eval report holds measured numbers.
**Milestone:** CI green; `docs/EVAL_REPORT.md` written from three live runs.

### 6.0 · Critical tests (~1.5 h)
- `policy`, `retrieval`, `guardrails`, `promptIsolation`, `toolActions`, `auth`, `evalRunner`, `errors`.
- ✅ `npm --prefix server test` passes.

### 6.1 · CI workflow (~0.5 h)
- `.github/workflows/ci.yml`: validate_pack → lint → test → mock eval `--fail-under 1.0` → client build.
- ✅ CI badge green on push.

### 6.2 · Benchmarks + live runs (~1 h)
- `scripts/bench-nonblocking.js` (idle vs during-eval p50/p95); 3 live eval runs (`--repeat 3`).
- ✅ p95 during ≤ 2× idle; live numbers captured.

### 6.3 · Eval report (~0.5 h)
- `reportWriter.js` → `docs/EVAL_REPORT.md`: metrics, per-case table, adversarial call-outs, change log,
  ablations, latency, Evals-tab screenshot.
- ✅ Report written from the 3 live runs + mock + 2 ablations.

**Flow:** `6.0 → 6.1`, `6.2 → 6.3`.
**If behind:** keep the 6 adversarial + idempotency tests, cut the rest.

---

## Phase 7 · README, Video, Submission (~5 h · Wed 4 – Thu 5 Nov)

**Goal:** a stranger can run the project from the README; the video shows every graded flow.

### 7.0 · README (~1.5 h)
- Setup, env vars, seeding, running, API table, running evals, architecture, design decisions,
  known limitations, added data.
- ✅ Covers every spec-required section.

### 7.1 · DESIGN.md (~0.75 h)
- Four decision records (rules-decide, `$text` over vectors, idempotency via indexes, in-process queue).
- ✅ Four ADRs with trade-offs.

### 7.2 · Held-out tickets (~0.5 h)
- `data/holdout/` + README note: 4 extra tickets (late-window gold goodwill, overheating-in-warranty,
  shipping-delay coupon, verified password reset); reported separately.
- ✅ Held-out run recorded apart from the 8 graded cases.

### 7.3 · Optional hosting (~1 h)
- Atlas M0 + Render (server) + Vercel (client); `CORS_ORIGIN` to the Vercel URL; warm before demo.
- ✅ Hosted URL loads (optional; local Docker is primary).

### 7.4 · Video (~1 h)
- Record 6–8 min following the plan's demo script (architecture → triage/draft → replacement + replay →
  `tkt_9006`/`9007` adversarial → evals + ablation → tests/CI).
- ✅ Every graded flow on screen.

### 7.5 · Submit (~0.25 h)
- Repo link + video + eval report by midday 5 Nov.
- ✅ **Final gate:** fresh clone → `cp .env.example .env && docker compose up --build` gives a working UI,
  and `npm run eval` (mock) works, following only the README, in under 10 minutes.

**Flow:** `7.0 → 7.1 → 7.2` (any order), `7.3` optional, then `7.4 → 7.5`.
**If behind:** skip hosting; a local recording satisfies the deliverables.
