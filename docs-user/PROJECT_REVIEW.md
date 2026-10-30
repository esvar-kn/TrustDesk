# TrustDesk — Full Project Review

_Reviewed 2026-10-29. Both servers run locally; all 8 UI flows, the adversarial
guardrail path, approvals lifecycle, and the eval suite were exercised end to end._

## How it was run
- No Docker / local MongoDB was available, so an **in-memory MongoDB**
  (`mongodb-memory-server`, already a dev dependency) was used.
- Seeded with `npm run seed`, API on `:4000`, Vite client on `:5173`,
  `LLM_PROVIDER=mock`.
- `vitest`: **77/77 passing**. `eslint` (server): **clean**.
  `oxlint` (client): **10 warnings**, all `set-state-in-effect`.

## Overall verdict
This is a strong, cohesive capstone. Triage → grounded draft → citations →
approval-gated actions → execution → deterministic trace all work. The
adversarial ticket (tkt_9006) is handled exactly right: SEV-1 alert, safe
fallback reply, "zero prompt leakage", and every unsafe tool blocked with
escalation. Code is clean (no TODOs, no `console.log`, no committed build
output, good comments). The issues below are polish, not structural.

---

## A. Odd / unwanted details — **UI**

1. **Generated draft is lost when you switch tickets (functional).**
   `DraftPanel` keeps the draft only in component state and never fetches the
   already-persisted draft on mount. Re-selecting a ticket shows "No draft yet"
   and the Recommended Action / Provenance panels go blank until you click
   *Regenerate*, even though the draft exists server-side.
   → `client/src/components/DraftPanel.jsx` (add a load-on-mount fetch of the
   latest draft, like `ActionPanel` already does for actions).

2. **"Awaiting approval" queue count is stale.**
   `ActionPanel` is never handed the `onChanged` callback, so requesting /
   approving / executing an action refreshes only the panel, not the sidebar
   counts (I saw "Awaiting approval 0" after requesting one).
   → `client/src/components/TicketDetail.jsx:131` — pass `onChanged` into
   `ActionPanel` and call it after `request/decide/execute`.

3. **Top-bar nav crowds / overlaps the search box at mid widths.**
   Below ~1100px the center search (`md:flex`, 768+) sits close to the nav and
   "Approvals"/"Evaluations" get truncated and are hard to click (a click landed
   in the search box). Fine at ≥1280px.
   → `client/src/components/shell/Header.jsx` — let the nav collapse or hide the
   search earlier.

4. **Dead asset files.** `client/src/assets/hero.png`, `react.svg`, `vite.svg`
   are tracked but referenced nowhere. Leftover Vite/React scaffolding.

5. **Client README is the default Vite template** ("React + Vite — This template
   provides a minimal setup…"). → `client/README.md` should describe TrustDesk
   or be removed.

6. **`client/public/icons.svg` is unused** (icons come from Google Fonts
   Material Symbols). Either wire it up or delete it.

7. **Fonts/icons load from Google Fonts CDN** (`index.html`). The app won't
   render its icons offline/air-gapped — worth self-hosting for a
   "deterministic, auditable" product.

8. **Minor:** triage/draft actions use `setTimeout`-based "Copied" toasts and
   several `set-state-in-effect` patterns (the 10 oxlint warnings) — harmless
   but flagged by the linter.

## B. Odd / unwanted details — **code / repo**

9. **Mock priority accuracy is 75%, under the 85% target**, shown red on the
   Evaluations page. This is by design (mock triage returns a fixed priority),
   but a reviewer sees a "failing" metric on first load. Consider labeling it
   "mock baseline" or seeding a mock that passes.

10. **Two parallel docs trees.** `docs/` (API, data model, eval, impl guide) and
    `docs-user/` (Stitch design prompts, phase breakdown, a
    `stitch_trustdesk_ai_operations_console` export). The `docs-user/` design
    artifacts look like build-process scratch; fine to keep but they're not
    product docs.

11. **Secrets handling is correct** but note the server exits hard if
    `AUTH_JWT_SECRET` / demo passwords are missing — good fail-fast, just make
    sure the README's first-run steps make that obvious (they mostly do).

---

## C. Suggested additional features

**Audit & trust (the product's core promise)**
- Persistent, filterable **audit log / activity feed** across tickets (who
  triaged, drafted, approved, executed, when) — currently the trace is per-run.
- **Export an approval packet** (PDF/JSONL) bundling the ticket, draft,
  citations, policy check, approver, and signature for compliance.
- **Reject-with-reason loop**: when a manager rejects, route a required note back
  to the agent and track it.

**Agent workflow**
- **Send / resolve the drafted reply** (even a mock "send") and move the ticket
  to a closed state — right now the lifecycle ends at "draft".
- **Draft editing** before approval, with a diff vs. the AI draft recorded.
- **Ticket states & assignment** (open / in-progress / waiting / closed, assign
  to agent) and real queue sorting/pagination.

**Retrieval & grounding**
- **Citation hover/preview inline** and a "why this citation" relevance score.
- **KB management UI** (view documents, trust levels, re-index) — the
  untrusted/quarantined KB doc is a great story to surface.

**Evaluations**
- **Run history & trend charts** (accuracy over time, regressions per prompt
  version) instead of only the latest run.
- **Per-case drill-down** linking a failing eval case to its full trace.
- **A/B prompt comparison** (v1 vs v2) using the existing `PROMPT_VERSION`.

**Platform / ops**
- **Real provider smoke test** button (verify Anthropic/OpenAI/Groq key + model
  from the UI).
- **Rate limiting & request IDs** on the API, and structured error surfacing in
  the client beyond the friendly message map.
- **Dockerfiles for server + client** (compose already hints they're a later
  phase) for one-command startup.
- **WebSocket/live updates** for the approvals queue instead of 2s polling.
