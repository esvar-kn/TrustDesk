// Non-blocking benchmark: proves the in-process eval job queue keeps the HTTP
// event loop responsive. It samples GET /api/health latency while idle, then
// again while an eval run churns in the background, and gates on
// p95(during) <= maxRatio * p95(idle) (default 2x).
//
//   node scripts/bench-nonblocking.js [--provider mock] [--repeat 3]
//     [--samples 300] [--max-ratio 2] [--abs-ms 50] [--no-gate]
//     [--mem]            self-contained: boot an in-memory mongod and seed it (default)
//     [--no-mem]         use MONGODB_URI instead (must already be seeded)
//     [--out path.json]  also write the summary JSON
//
// A live run needs a real key:  LLM_PROVIDER=groq LLM_API_KEY=... LLM_MODEL=...
//   node scripts/bench-nonblocking.js --no-mem --provider groq --repeat 3
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';

import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { runEval } from '../src/services/evals/evalRunner.js';

function parseArgs(argv) {
  const args = { mem: true, gate: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--provider') args.provider = argv[++i];
    else if (a === '--repeat') args.repeat = parseInt(argv[++i], 10);
    else if (a === '--samples') args.samples = parseInt(argv[++i], 10);
    else if (a === '--max-ratio') args.maxRatio = parseFloat(argv[++i]);
    else if (a === '--abs-ms') args.absMs = parseFloat(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--mem') args.mem = true;
    else if (a === '--no-mem') args.mem = false;
    else if (a === '--no-gate') args.gate = false;
  }
  return args;
}

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};
const round = (n) => Math.round(n * 1000) / 1000;

async function sampleLatencies(base, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    const res = await fetch(`${base}/api/health`);
    await res.arrayBuffer();
    out.push(performance.now() - t0);
  }
  return out;
}

function stats(samples) {
  return {
    n: samples.length,
    p50_ms: round(percentile(samples, 50)),
    p95_ms: round(percentile(samples, 95)),
    max_ms: round(Math.max(...samples)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerName = args.provider || env.LLM_PROVIDER;
  const repeat = Number.isInteger(args.repeat) && args.repeat > 0 ? args.repeat : 3;
  const samples = Number.isInteger(args.samples) && args.samples > 0 ? args.samples : 300;
  const maxRatio = args.maxRatio || 2;
  // Absolute responsiveness floor: in the sub-millisecond regime a tiny jitter
  // can blow the ratio past 2x while the API is still trivially responsive, so a
  // during-p95 under this many ms also counts as a pass (a genuinely blocked
  // loop spikes to hundreds of ms and fails both tests).
  const absMs = args.absMs || 50;

  // --- Database: in-memory (default, self-contained) or MONGODB_URI. ---
  let mem = null;
  if (args.mem) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const { seedTestDb } = await import('../test/helpers/seedTestDb.js');
    mem = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    await mongoose.connect(mem.getUri());
    await seedTestDb();
  } else {
    await mongoose.connect(env.MONGODB_URI);
  }

  // --- Start the real app on an ephemeral port. ---
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  console.log(`bench-nonblocking: provider=${providerName} repeat=${repeat} samples=${samples}`);

  // Warm up (JIT, connection pool).
  await sampleLatencies(base, 20);

  // --- Idle baseline. ---
  const idle = stats(await sampleLatencies(base, samples));

  // --- Background load: run evals back-to-back while we sample. ---
  let running = true;
  let evalCount = 0;
  const loadLoop = (async () => {
    while (running) {
      await runEval({ providerName, repeat });
      evalCount += 1;
    }
  })();

  // Give the load a moment to spin up, then sample under load.
  await new Promise((r) => setTimeout(r, 50));
  const during = stats(await sampleLatencies(base, samples));

  running = false;
  await loadLoop;

  const ratio = round(during.p95_ms / Math.max(idle.p95_ms, 0.5));
  const pass = ratio <= maxRatio || during.p95_ms <= absMs;

  const summary = {
    provider: providerName,
    repeat,
    samples,
    eval_runs_during_window: evalCount,
    idle,
    during,
    p95_ratio: ratio,
    max_ratio: maxRatio,
    abs_ms: absMs,
    pass,
    generated_at: new Date().toISOString(),
  };

  console.log('\nHealth latency (ms):');
  console.log(`  idle    p50=${idle.p50_ms}  p95=${idle.p95_ms}  max=${idle.max_ms}`);
  console.log(`  during  p50=${during.p50_ms}  p95=${during.p95_ms}  max=${during.max_ms}`);
  console.log(`  eval runs completed during the window: ${evalCount}`);
  console.log(`  p95 ratio (during/idle): ${ratio}  (limit ${maxRatio}x, or during-p95 <= ${absMs}ms)`);
  console.log(pass ? '\nPASS: event loop stayed responsive under eval load.' : '\nFAIL: p95 under load exceeded the limit.');

  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`wrote ${outPath}`);
  }

  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mem) await mem.stop();

  process.exit(args.gate && !pass ? 1 : 0);
}

main().catch((err) => {
  console.error('bench failed:', err);
  process.exit(1);
});
