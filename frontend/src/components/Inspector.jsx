import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { clearLog } from '../api.js';
import { fmtBytes, fmtMs } from '../lib/format.js';
import { useEscape } from '../lib/hooks.js';

function tone(c) {
  if (c.pending) return 'pending';
  if (!c.status) return 'err';
  if (c.kind === 'GraphQL' && c.response && c.response.errors) return 'warn';
  if (c.status >= 500) return 'err';
  if (c.status >= 400) return 'warn';
  return 'ok';
}

function operationName(query) {
  const named = /(query|mutation)\s+(\w+)/.exec(query);
  if (named) return `${named[1]} ${named[2]}`;
  const field = /\{\s*(\w+)/.exec(query);
  return field ? `{ ${field[1]} }` : 'query';
}

function pretty(value, max = 6000) {
  if (value === undefined || value === null) return 'null';
  const s = JSON.stringify(value, null, 2);
  return s.length > max ? `${s.slice(0, max)}\n… ${s.length - max} more characters` : s;
}

export default function Inspector({ log, onClose }) {
  const [open, setOpen] = useState(null);
  useEscape(onClose);
  const { calls, budget } = log;
  const totals = calls.reduce(
    (acc, c) => {
      acc.bytes += c.bytes || 0;
      acc[c.kind] += 1;
      return acc;
    },
    { bytes: 0, REST: 0, GraphQL: 0 }
  );
  const pct = budget ? Math.round((budget.remaining / budget.limit) * 100) : 100;

  return (
    <aside className="inspector" aria-label="API request log">
      <header className="insp-head">
        <div>
          <h2>
            <Icon name="pulse" size={18} /> API log
          </h2>
          <p>Every request this page made. Nothing on screen comes from anywhere else.</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close API log">
          <Icon name="x" />
        </button>
      </header>

      <div className="insp-stats">
        <div>
          <b>{calls.length}</b>
          <span>requests</span>
        </div>
        <div>
          <b className="rest-ink">{totals.REST}</b>
          <span>REST</span>
        </div>
        <div>
          <b className="gql-ink">{totals.GraphQL}</b>
          <span>GraphQL</span>
        </div>
        <div>
          <b>{fmtBytes(totals.bytes)}</b>
          <span>received</span>
        </div>
      </div>

      <div className="insp-budget">
        <div className="insp-budget-row">
          <span>Rate-limit budget</span>
          <code>
            {budget ? `${budget.remaining}/${budget.limit} · resets in ${budget.reset}s` : 'no /api/v1 call yet'}
          </code>
        </div>
        <div className={`meter ${pct < 20 ? 'low' : pct < 50 ? 'mid' : ''}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <small className="muted">From the RateLimit-* headers on the latest response; REST and GraphQL share one limiter.</small>
      </div>

      <div className="insp-toolbar">
        <span className="muted small">Newest first · click a row for headers and payloads</span>
        <button type="button" className="btn ghost sm" onClick={clearLog} disabled={!calls.length}>
          Clear
        </button>
      </div>

      <ol className="calls">
        {calls.length === 0 && <li className="calls-empty">No requests yet.</li>}
        {calls.map((c) => {
          const t = tone(c);
          const isOpen = open === c.id;
          const isGql = c.kind === 'GraphQL';
          const op = isGql && c.request && c.request.query ? operationName(c.request.query) : null;
          return (
            <li key={c.id} className={`call ${t} ${isOpen ? 'open' : ''}`}>
              <button type="button" className="call-row" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                <span className={`verb ${isGql ? 'gql' : c.method.toLowerCase()}`}>{isGql ? 'GQL' : c.method}</span>
                <span className="call-main">
                  <span className="call-label">{c.label || op || c.url}</span>
                  <code className="call-url">{isGql ? `POST /graphql · ${op}` : c.url}</code>
                </span>
                <span className={`call-status ${t}`}>{c.pending ? '···' : c.status || 'ERR'}</span>
                <span className="call-meta">
                  {fmtMs(c.ms)}
                  <br />
                  {fmtBytes(c.bytes)}
                </span>
              </button>
              {isOpen && (
                <div className="call-detail">
                  <div className="kv">
                    <span>Request</span>
                    <code>
                      {c.method} {c.url}
                    </code>
                  </div>
                  <div className="kv">
                    <span>Auth</span>
                    <code>{c.auth ? 'Authorization: Bearer ••••••' : 'none (public)'}</code>
                  </div>
                  {c.rateLimit && (
                    <div className="kv">
                      <span>RateLimit</span>
                      <code>
                        {c.rateLimit.remaining}/{c.rateLimit.limit} left · reset {c.rateLimit.reset}s
                      </code>
                    </div>
                  )}
                  {c.request && isGql && (
                    <>
                      <h4>Query</h4>
                      <pre>{String(c.request.query).trim()}</pre>
                      {c.request.variables && (
                        <>
                          <h4>Variables</h4>
                          <pre>{pretty(c.request.variables)}</pre>
                        </>
                      )}
                    </>
                  )}
                  {c.request && !isGql && (
                    <>
                      <h4>Body</h4>
                      <pre>{pretty(c.request)}</pre>
                    </>
                  )}
                  <h4>Response</h4>
                  <pre>{c.pending ? 'waiting…' : pretty(c.response)}</pre>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
