// Loads the optional held-out evaluation set from <dataDir>/holdout/.
//
// Held-out tickets are scored and reported APART from the graded cases: their
// eval cases carry `set: 'holdout'`, so the runner excludes them from the
// default (graded) run and the `--fail-under` CI gate. They probe
// generalisation — scenarios the policy rules were not tuned against.
//
// Pure (no DB): callers persist what this returns. Returns empty arrays when
// the holdout/ directory (or an individual file) is absent, so the set is
// strictly optional.
import fs from 'node:fs';
import path from 'node:path';

// Split the evaluator labels off each ticket into a separate record, mirroring
// the main seeder so no `expected_*` field ever lands on a ticket the AI reads.
function splitTicketLabels(rawTickets) {
  const tickets = [];
  const labels = [];
  for (const t of rawTickets) {
    const {
      expected_category,
      expected_priority,
      expected_sentiment,
      expected_escalation,
      expected_actions,
      ...ticket
    } = t;
    tickets.push(ticket);
    labels.push({
      ticket_id: t.ticket_id,
      expected_category,
      expected_priority,
      expected_sentiment,
      expected_escalation,
      expected_actions,
    });
  }
  return { tickets, labels };
}

export function loadHoldout(dataDir) {
  const dir = path.join(dataDir, 'holdout');
  if (!fs.existsSync(dir)) {
    return { present: false, customers: [], orders: [], tickets: [], labels: [], cases: [] };
  }

  const readJson = (file) => {
    const p = path.join(dir, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  };
  const readJsonl = (file) => {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  };

  const { tickets, labels } = splitTicketLabels(readJson('tickets.json'));
  const cases = readJsonl('eval_cases.jsonl').map((c) => ({
    case_id: c.case_id,
    ticket_id: c.ticket_id,
    input: c.input,
    expected: c.expected,
    set: 'holdout',
  }));

  return {
    present: true,
    customers: readJson('customers.json'),
    orders: readJson('orders.json'),
    tickets,
    labels,
    cases,
  };
}
