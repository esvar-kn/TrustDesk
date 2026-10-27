import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const ok = (cond) => (cond ? '✓' : '✗');

export default function EvalView() {
  const [runs, setRuns] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  async function loadList() {
    try {
      setRuns(await api('/eval-runs'));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadList();
    return () => clearInterval(pollRef.current);
  }, []);

  function poll(id) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const run = await api(`/eval-runs/${id}`);
        setCurrent(run);
        if (run.status === 'completed' || run.status === 'failed') {
          clearInterval(pollRef.current);
          setBusy(false);
          loadList();
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setBusy(false);
        setError(e.message);
      }
    }, 2000);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/eval-runs', { method: 'POST', body: { provider: 'mock' } });
      setCurrent({ eval_run_id: r.eval_run_id, status: 'queued' });
      poll(r.eval_run_id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function view(id) {
    try {
      setCurrent(await api(`/eval-runs/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }

  const m = current?.metrics;

  return (
    <div>
      <div className="row">
        <h3>Evaluations</h3>
        <button className="btn" onClick={start} disabled={busy}>
          {busy ? 'Running…' : 'Run eval (mock)'}
        </button>
      </div>
      {error && <div className="banner error">{error}</div>}

      {runs.length > 0 && (
        <div className="eval-runs">
          <span className="k">Recent runs</span>
          <div className="cite-chips">
            {runs.slice(0, 6).map((r) => (
              <button
                key={r.eval_run_id}
                className={`cite-chip${current?.eval_run_id === r.eval_run_id ? ' active' : ''}`}
                onClick={() => view(r.eval_run_id)}
              >
                {r.status} {r.eval_run_id.slice(5, 13)}
              </button>
            ))}
          </div>
        </div>
      )}

      {current && (
        <>
          <p className="muted small">
            {current.eval_run_id} · {current.status}
            {current.provider ? ` · ${current.provider}` : ''}
            {busy ? ' · polling every 2s…' : ''}
          </p>

          {m && (
            <table className="metrics">
              <tbody>
                {Object.entries(m)
                  .filter(([k]) => k !== 'cases')
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className={typeof v === 'number' && v >= 1 ? 'ok-text' : ''}>
                        {typeof v === 'number' ? v.toFixed(3) : String(v)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {current.case_results?.length > 0 && (
            <table className="cases">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Escalate</th>
                  <th>Decision</th>
                  <th>Reqs</th>
                </tr>
              </thead>
              <tbody>
                {current.case_results.map((c) => {
                  const reqPass = c.requirement_results.filter((x) => x.status === 'pass').length;
                  return (
                    <tr key={c.case_id}>
                      <td>{c.case_id}</td>
                      <td>
                        {c.predicted_category} {ok(c.predicted_category === c.expected.category)}
                      </td>
                      <td>
                        {c.predicted_priority} {ok(c.predicted_priority === c.expected.priority)}
                      </td>
                      <td>
                        {String(c.predicted_should_escalate)}{' '}
                        {ok(c.predicted_should_escalate === c.expected.should_escalate)}
                      </td>
                      <td>{c.decision}</td>
                      <td>
                        {reqPass}/{c.requirement_results.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
