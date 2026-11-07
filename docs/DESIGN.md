# Design decisions

Four architectural decision records for TrustDesk. Each states the context, the
decision, the trade-off accepted, and where the decision lives in the code so it
can be audited or revisited.

---

## ADR 1 — Rules decide, the model drafts

**Context.** Support actions have real consequences (refunds, replacements,
escalations). A large language model is good at language — classifying intent,
matching tone, drafting a reply — but it is non-deterministic and can be steered
by crafted ticket text.

**Decision.** Deterministic, unit-tested policy facts own every consequential
decision: eligibility, return/refund windows (judged by `created_at`), tool
allowlists, and escalation floors. The model only proposes language; it never
has final say on priority or on which tool runs.

**Trade-off.** The rules must be maintained by hand as policy changes, rather
than being inferred. In exchange, every decision is auditable, reproducible, and
replayable — the trace shows exactly which rule fired and which KB sentence it
cites. Policy labels live in a collection that AI code cannot import (enforced by
a lint rule plus a prompt-isolation test), so the model cannot read the graded
answers.

**Where it lives.** `server/src/services/policy/`, gated at the tool layer in
`server/src/services/tools/`; replay is surfaced through the trace.

---

## ADR 2 — MongoDB `$text` over a vector store

**Context.** Retrieval has to ground the draft in the knowledge base. The KB is
small (≈8 documents, ≈25 chunks), and the trace needs to explain *why* a document
ranked.

**Decision.** Use MongoDB's `$text` index with field weights (title 5 / heading 3
/ text 1), combined with order-derived query terms, instead of embeddings.

**Trade-off.** Keyword retrieval misses paraphrases that share no terms with the
KB, where a vector store would do better. In exchange we avoid a second storage
system, an embedding key, and the nondeterminism they bring — and ranking stays
inspectable. `search()` is a single seam, so a vector backend can be swapped in
later without touching callers.

**Where it lives.** Index: `server/src/models/KbChunk.js` (`kb_chunk_text`).
Query and seam: `server/src/services/retrieval/retriever.js` (`search()`).
Untrusted documents are quarantined, never fed to the model as instructions
(`server/src/services/retrieval/queryBuilder.js`).

---

## ADR 3 — Idempotency through unique indexes, not transactions

**Context.** A tool action can be requested or executed more than once —
retries, double-clicks, concurrent callers. Duplicates must collapse to a single
real side effect, and the deployment target is a standalone MongoDB (no replica
set, so no multi-document transactions).

**Decision.** Enforce idempotency with two unique indexes rather than
application-level locking or transactions: one on the **request** record
(`ToolAction.idempotency_key`) and one on the **side-effect** record
(`ReplacementOrder.idempotency_key`). A duplicate key violation is caught and
replays the existing record instead of creating a new one.

**Trade-off.** Correctness rests on index constraints and conflict handling
rather than a transactional boundary, so each new side effect must carry its own
unique key. In exchange it holds under concurrency on a single node with no
replica set required.

**Where it lives.** `server/src/models/ToolAction.js` and
`server/src/models/ReplacementOrder.js`. Verified by a 10-parallel-request test
and a double-execute test against a real in-memory Mongo engine.

---

## ADR 4 — In-process job queue over Redis / BullMQ

**Context.** Evaluation runs fan out many provider calls and must not block the
request path. The work is I/O-bound (waiting on the LLM), not CPU-bound.

**Decision.** Run evals through an in-process queue backed by `p-limit`, bounded
by `EVAL_CONCURRENCY`, instead of adding an external broker like Redis or BullMQ.
Because the work is I/O-bound, the event loop stays responsive under load (shown
by the non-blocking bench).

**Trade-off.** Jobs live only as long as the process — a restart loses in-flight
runs, and the queue is single-node, so horizontal scaling would need an external
broker. The loss is made visible through the `eval_runs.status` field, so a
killed job shows as incomplete rather than silently vanishing.

**Where it lives.** `server/src/jobs/jobQueue.js`. Status is tracked on the
`EvalRun` model and polled by the client's Evals tab.

---

*The UI design system (Material-3 tokens, audit-first light/dark theme, IBM Plex
Sans + JetBrains Mono) is documented separately in
[`planning/stitch_trustdesk_ai_operations_console/trustdesk/DESIGN.md`](../planning/stitch_trustdesk_ai_operations_console/trustdesk/DESIGN.md).*
