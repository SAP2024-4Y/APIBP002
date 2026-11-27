import React, { useMemo, useRef, useState } from 'react';
import { api, probeGql, probeRest } from '../api.js';
import Icon from '../components/Icon.jsx';
import { fmtBytes, fmtMs } from '../lib/format.js';

const TABS = [
  ['usecases', 'Use cases & roles', 'layers'],
  ['compare', 'REST vs GraphQL', 'bolt'],
  ['errors', 'Error parity', 'alert'],
];

const ROLE_MATRIX = [
  ['Browse, search and open products', 'GET /products, /products/{id}', ['yes', 'yes', 'yes']],
  ['Search by distance or region', 'GET /products/map', ['yes', 'yes', 'yes']],
  ['See delivery windows', 'GET /slots, /products/{id}/slots', ['yes', 'yes', 'yes']],
  ['Book, list and cancel own deliveries', 'POST · GET · DELETE /bookings', ['401', 'yes', 'yes']],
  ['Create, update and delete products', 'POST · PATCH · DELETE /products', ['401', '403', 'yes']],
  ['Read catalogue metrics', 'GET /admin/stats', ['401', '403', 'yes']],
];

const USE_CASES = [
  {
    actor: 'Shopper',
    role: 'public',
    goal: 'Find a product worth buying',
    steps: [
      ['Search and filter the catalogue', 'GET /api/v1/products?q=&category=&min_price=&sort=&order=', 'products(q:, category:, first:)'],
      ['Read the next page', 'GET /api/v1/products?after={next_cursor}', 'products(after: endCursor)'],
      ['Open one product', 'GET /api/v1/products/{id}', 'product(id:)'],
    ],
  },
  {
    actor: 'Shopper',
    role: 'public',
    goal: 'Find what ships close to me',
    steps: [
      ['Share my position from the browser', 'Client-side geolocation; sent only as query parameters', null],
      ['Search a radius around me', 'GET /api/v1/products/map?latitude=&longitude=&radius_km=', 'productsNear(latitude:, longitude:, radiusKm:)'],
      ['Search a region instead', 'GET /api/v1/products/map?min_lat=&min_lon=&max_lat=&max_lon=', 'productsInBounds(...)'],
    ],
  },
  {
    actor: 'Customer',
    role: 'customer',
    goal: 'Get a delivery in a window that suits me',
    steps: [
      ['Sign in', 'POST /api/v1/auth/token', 'requestToken(username:, password:)'],
      ['See open delivery windows', 'GET /api/v1/slots?starts_at=&ends_at=', 'slots(startsAt:, endsAt:)'],
      ['Book a slot (409 if full or overlapping)', 'POST /api/v1/bookings', 'bookSlot(slotId:, quantity:)'],
      ['Review my deliveries', 'GET /api/v1/bookings', 'myBookings { slot { product } }'],
      ['Cancel and release the capacity', 'DELETE /api/v1/bookings/{id}', 'cancelBooking(bookingId:)'],
    ],
  },
  {
    actor: 'Admin',
    role: 'admin',
    goal: 'Keep the catalogue accurate',
    steps: [
      ['Sign in as admin', 'POST /api/v1/auth/token', 'requestToken'],
      ['Check stock and bookings', 'GET /api/v1/admin/stats', null],
      ['Add a product', 'POST /api/v1/products', null],
      ['Fix price, stock or status', 'PATCH /api/v1/products/{id}', null],
      ['Retire a product (cascades slots + bookings)', 'DELETE /api/v1/products/{id}', null],
    ],
  },
];

function UseCases() {
  return (
    <div className="lab-usecases">
      <div className="card pad">
        <h3 className="lab-h">
          <Icon name="shield" size={16} /> Who can do what
        </h3>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Capability</th>
                <th>REST</th>
                <th>
                  <span className="role-badge public">public</span>
                </th>
                <th>
                  <span className="role-badge customer">customer</span>
                </th>
                <th>
                  <span className="role-badge admin">admin</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROLE_MATRIX.map(([what, rest, cells]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td>
                    <code>{rest}</code>
                  </td>
                  {cells.map((c, i) => (
                    <td key={i} className={`cell-${c === 'yes' ? 'yes' : 'no'}`}>
                      {c === 'yes' ? <Icon name="check" size={16} /> : <code>{c}</code>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          The same roles appear at the start of every operation description (and in <code>x-roles</code>) in{' '}
          <a href="/docs" target="_blank" rel="noreferrer">
            /docs
          </a>
          .
        </p>
      </div>

      <div className="usecase-grid">
        {USE_CASES.map((uc) => (
          <article key={uc.goal} className="card usecase">
            <header>
              <span className={`role-badge ${uc.role}`}>{uc.actor}</span>
              <h3>{uc.goal}</h3>
            </header>
            <ol className="steps">
              {uc.steps.map(([action, rest, graph], i) => (
                <li key={action}>
                  <span className="step-n">{i + 1}</span>
                  <div>
                    <b>{action}</b>
                    <div className="step-apis">
                      <code className="rest">{rest}</code>
                      {graph && <code className="gql">{graph}</code>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </div>
  );
}

const COMPOSITE = `query Composite($id: ID!) {
  product(id: $id) {
    name
    location { coordinates }
    slots { startsAt endsAt available }
  }
}`;

function Compare({ products }) {
  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [picked, setPicked] = useState('');
  const id = picked || (sorted[0] ? sorted[0].id : 'prod_001');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const path = `/api/v1/products/${encodeURIComponent(id)}`;
      const product = await probeRest('GET', path, { label: 'Compare · REST product' });
      const slots = await probeRest('GET', `${path}/slots`, { label: 'Compare · REST slots' });
      const graph = await probeGql(COMPOSITE, { id }, { label: 'Compare · GraphQL composite' });
      setRun({ rest: [product, slots], graph });
    } finally {
      setBusy(false);
    }
  };

  const restBytes = run ? run.rest.reduce((n, r) => n + r.bytes, 0) : 0;
  const restMs = run ? run.rest.reduce((n, r) => n + r.ms, 0) : 0;
  const maxBytes = run ? Math.max(restBytes, run.graph.bytes) : 1;
  const saved = run && restBytes ? Math.round((1 - run.graph.bytes / restBytes) * 100) : 0;

  return (
    <div className="lab-compare">
      <div className="card pad compare-head">
        <div>
          <h3 className="lab-h">
            <Icon name="bolt" size={16} /> Same screen, two paradigms
          </h3>
          <p className="muted">
            The product view needs a product, its hub location and its delivery slots. REST serves two resources; GraphQL
            serves exactly the fields asked for. This runs both live against this server.
          </p>
        </div>
        <div className="compare-controls">
          <select className="field" value={id} onChange={(e) => setPicked(e.target.value)} aria-label="Product to compare">
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn primary" onClick={go} disabled={busy}>
            <Icon name="bolt" size={16} /> {busy ? 'Running…' : run ? 'Run again' : 'Run comparison'}
          </button>
        </div>
      </div>

      {run && (
        <>
          <div className="verdict">
            <Icon name="check" size={18} />
            GraphQL used <b>1</b> round-trip instead of <b>2</b> and <b>{saved}%</b> fewer bytes ({fmtBytes(run.graph.bytes)} vs{' '}
            {fmtBytes(restBytes)}).
          </div>
          <div className="compare-cols">
            <div className="card pad compare-col rest">
              <h4>
                <span className="verb get">REST</span> 2 requests
              </h4>
              <ul className="req-list">
                {run.rest.map((r, i) => (
                  <li key={i}>
                    <code>GET /api/v1/products/{id}{i === 1 ? '/slots' : ''}</code>
                    <span>
                      {r.status} · {fmtBytes(r.bytes)} · {fmtMs(r.ms)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="bar">
                <i style={{ width: `${(restBytes / maxBytes) * 100}%` }} />
              </div>
              <div className="compare-total">
                {fmtBytes(restBytes)} · {fmtMs(restMs)} sequential
              </div>
              <details>
                <summary>Payloads</summary>
                <pre>{JSON.stringify(run.rest.map((r) => r.data), null, 2)}</pre>
              </details>
            </div>
            <div className="card pad compare-col gql">
              <h4>
                <span className="verb gql">GQL</span> 1 request
              </h4>
              <pre className="query-pre">{COMPOSITE}</pre>
              <div className="bar">
                <i style={{ width: `${(run.graph.bytes / maxBytes) * 100}%` }} />
              </div>
              <div className="compare-total">
                {fmtBytes(run.graph.bytes)} · {fmtMs(run.graph.ms)}
              </div>
              <details>
                <summary>Payload</summary>
                <pre>{JSON.stringify(run.graph.data, null, 2)}</pre>
              </details>
            </div>
          </div>
          <p className="muted small">
            Where REST wins: each GET URL is its own cache key, so product metadata (stable) and slots (volatile) can be
            cached with different TTLs by browsers and CDNs; GraphQL is one POST endpoint and needs app-level caching.
          </p>
        </>
      )}
    </div>
  );
}

const BOOK_GQL = 'mutation Book($slotId: ID!, $quantity: Int! = 1) { bookSlot(slotId: $slotId, quantity: $quantity) { id } }';
const L = (label) => ({ label: `Lab · ${label}` });

const SCENARIOS = [
  {
    id: 'validation',
    code: 'VALIDATION_ERROR',
    title: 'Negative price filter',
    rest: () => probeRest('GET', '/api/v1/products?min_price=-5', L('negative price')),
    gql: () => probeGql('{ products(minPrice: -5) { totalCount } }', undefined, L('negative price')),
  },
  {
    id: 'category',
    code: 'VALIDATION_ERROR',
    title: 'Category outside the enum',
    rest: () => probeRest('GET', '/api/v1/products?category=Toys', L('unknown category')),
    gql: () => probeGql('{ products(category: "Toys") { totalCount } }', undefined, L('unknown category')),
  },
  {
    id: 'cursor',
    code: 'INVALID_CURSOR',
    title: 'Tampered pagination cursor',
    rest: () => probeRest('GET', '/api/v1/products?after=not-a-cursor', L('bad cursor')),
    gql: () => probeGql('{ products(after: "not-a-cursor") { totalCount } }', undefined, L('bad cursor')),
  },
  {
    id: 'coords',
    code: 'INVALID_COORDINATES',
    title: 'Latitude of 200°',
    rest: () => probeRest('GET', '/api/v1/products/map?latitude=200&longitude=77&radius_km=5', L('bad latitude')),
    gql: () => probeGql('{ productsNear(latitude: 200, longitude: 77, radiusKm: 5) { distanceKm } }', undefined, L('bad latitude')),
  },
  {
    id: 'creds',
    code: 'INVALID_CREDENTIALS',
    title: 'Wrong password',
    rest: () => probeRest('POST', '/api/v1/auth/token', { body: { username: 'demo', password: 'not-the-password' }, ...L('wrong password') }),
    gql: () =>
      probeGql(
        'mutation Login($username: String!, $password: String!) { requestToken(username: $username, password: $password) { token } }',
        { username: 'demo', password: 'not-the-password' },
        L('wrong password')
      ),
  },
  {
    id: 'unauth',
    code: 'UNAUTHENTICATED',
    title: 'Booking without a token',
    rest: () => probeRest('POST', '/api/v1/bookings', { body: { slot_id: 'slot_001_1' }, ...L('no token') }),
    gql: () => probeGql(BOOK_GQL, { slotId: 'slot_001_1' }, L('no token')),
  },
  {
    id: 'forbidden',
    code: 'FORBIDDEN',
    title: 'Customer token on an admin write',
    rest: (token) =>
      probeRest('POST', '/api/v1/products', {
        body: { name: 'Lab probe', category: 'Books', status: 'active', price: 1, latitude: 12.97, longitude: 77.59 },
        token,
        ...L('customer creates product'),
      }),
    gqlNote: 'Catalogue writes are REST-only (back-office surface).',
  },
  {
    id: 'product404',
    code: 'PRODUCT_NOT_FOUND',
    title: 'Unknown product id',
    rest: () => probeRest('GET', '/api/v1/products/prod_missing', L('unknown product')),
    gql: () => probeGql('{ product(id: "prod_missing") { id } }', undefined, L('unknown product')),
    gqlNull: true,
    gqlNote: 'By design: a nullable lookup returns null, not an error.',
  },
  {
    id: 'slot404',
    code: 'SLOT_NOT_FOUND',
    title: 'Booking a slot that does not exist',
    rest: (token) => probeRest('POST', '/api/v1/bookings', { body: { slot_id: 'slot_missing' }, token, ...L('unknown slot') }),
    gql: (token) => probeGql(BOOK_GQL, { slotId: 'slot_missing' }, { token, ...L('unknown slot') }),
  },
  {
    id: 'qty',
    code: 'UNPROCESSABLE',
    title: 'Quantity of 0',
    rest: (token) => probeRest('POST', '/api/v1/bookings', { body: { slot_id: 'slot_001_1', quantity: 0 }, token, ...L('zero quantity') }),
    gql: (token) => probeGql(BOOK_GQL, { slotId: 'slot_001_1', quantity: 0 }, { token, ...L('zero quantity') }),
  },
  {
    id: 'full',
    code: 'SLOT_FULL',
    title: 'Slot already at capacity',
    rest: (token) => probeRest('POST', '/api/v1/bookings', { body: { slot_id: 'slot_full_demo' }, token, ...L('full slot') }),
    gql: (token) => probeGql(BOOK_GQL, { slotId: 'slot_full_demo' }, { token, ...L('full slot') }),
  },
  { id: 'overlap', code: 'BOOKING_OVERLAP', title: 'Two deliveries in one window', scripted: true },
  {
    id: 'route',
    code: 'NOT_FOUND',
    title: 'Unknown REST route',
    rest: () => probeRest('GET', '/api/v1/nowhere', L('unknown route')),
    gqlNote: 'GraphQL has one endpoint; unknown fields fail schema validation instead.',
  },
];

// Books one slot, tries a second slot in the same window on both APIs, then cancels what it created.
async function runOverlap(token) {
  const steps = [];
  const list = await probeRest('GET', `/api/v1/slots?starts_at=${encodeURIComponent(new Date().toISOString())}`, L('find a shared window'));
  const windows = new Map();
  ((list.data && list.data.data) || []).forEach((s) => {
    if (s.available < 1) return;
    const key = `${s.starts_at}|${s.ends_at}`;
    if (!windows.has(key)) windows.set(key, []);
    windows.get(key).push(s);
  });
  const pair = [...windows.values()].filter((w) => w.length >= 2).pop();
  if (!pair) {
    return { rest: { ok: false, status: 0, code: 'NO_SHARED_WINDOW', message: 'No upcoming window has two open slots.' }, steps };
  }
  const [a, b] = pair;
  const first = await probeRest('POST', '/api/v1/bookings', { body: { slot_id: a.id }, token, ...L('book first slot') });
  steps.push(`POST /bookings {slot_id: ${a.id}} → ${first.status}${first.code ? ` ${first.code}` : ''}`);
  let rest = first;
  if (first.ok) {
    rest = await probeRest('POST', '/api/v1/bookings', { body: { slot_id: b.id }, token, ...L('clashing slot') });
    steps.push(`POST /bookings {slot_id: ${b.id}} → ${rest.status} ${rest.code || ''}`);
  }
  const graph = await probeGql(BOOK_GQL, { slotId: b.id }, { token, ...L('clashing slot') });
  steps.push(`bookSlot(slotId: ${b.id}) → ${graph.code || 'booked'}`);
  const cleanup = [first.ok && first.data.created.id, graph.ok && graph.data && graph.data.bookSlot && graph.data.bookSlot.id].filter(Boolean);
  for (const bookingId of cleanup) {
    const del = await probeRest('DELETE', `/api/v1/bookings/${bookingId}`, { token, ...L('clean up') });
    steps.push(`DELETE /bookings/${bookingId} → ${del.status} (capacity released)`);
  }
  return { rest, graph, steps };
}

function Outcome({ result, paradigm }) {
  if (!result) return <span className="muted small">not run</span>;
  if (result.ok) return <span className="outcome ok">{result.status} OK</span>;
  const status = paradigm === 'gql' ? result.httpStatus || result.status : result.status;
  return (
    <span className="outcome">
      <code className="code-tag">{result.code}</code>
      {status ? <small>HTTP {status}</small> : null}
    </span>
  );
}

function ErrorParity() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState('');
  const [limitRun, setLimitRun] = useState(null);
  const tokenRef = useRef(null);

  const customerToken = async () => {
    if (!tokenRef.current) tokenRef.current = (await api.login('demo', 'demo-password')).token;
    return tokenRef.current;
  };

  const runOne = async (s) => {
    setRunning(s.id);
    try {
      const token = await customerToken();
      if (s.scripted) {
        const out = await runOverlap(token);
        setResults((r) => ({ ...r, [s.id]: out }));
      } else {
        const rest = await s.rest(token);
        const graph = s.gql ? await s.gql(token) : null;
        setResults((r) => ({ ...r, [s.id]: { rest, graph } }));
      }
    } catch (e) {
      setResults((r) => ({ ...r, [s.id]: { rest: { ok: false, status: e.status, code: e.code, message: e.message, hint: e.hint } } }));
    } finally {
      setRunning('');
    }
  };

  const runAll = async () => {
    for (const s of SCENARIOS) {
      await runOne(s);
    }
  };

  const exhaustBudget = async () => {
    const ok = window.confirm(
      'This sends requests until the shared rate limiter answers 429. The whole UI will see RATE_LIMITED until the window resets (up to a minute). Continue?'
    );
    if (!ok) return;
    setRunning('rate');
    try {
      let hit = null;
      for (let batch = 0; batch < 20 && !hit; batch += 1) {
        const round = await Promise.all(
          Array.from({ length: 10 }, () => probeRest('GET', '/api/v1/products?limit=1', L('burn budget')))
        );
        hit = round.find((r) => r.status === 429) || null;
      }
      const graph = await probeGql('{ products(first: 1) { totalCount } }', undefined, L('rate limited'));
      setLimitRun({ rest: hit, graph });
    } finally {
      setRunning('');
    }
  };

  const covered = new Set(
    Object.entries(results)
      .filter(([, r]) => r.rest && r.rest.code)
      .map(([, r]) => r.rest.code)
  );
  if (limitRun && limitRun.rest) covered.add('RATE_LIMITED');

  return (
    <div className="lab-errors">
      <div className="card pad compare-head">
        <div>
          <h3 className="lab-h">
            <Icon name="alert" size={16} /> One catalogue, two paradigms
          </h3>
          <p className="muted">
            Each scenario hits REST and GraphQL with the same mistake. Both answer with the same code from{' '}
            <code>src/errors.js</code>, a message saying what went wrong and a hint saying what to do next.
          </p>
        </div>
        <div className="compare-controls">
          <span className="coverage">
            <b>{covered.size}</b>/14 codes shown live
          </span>
          <button type="button" className="btn primary" onClick={runAll} disabled={Boolean(running)}>
            <Icon name="bolt" size={16} /> {running ? 'Running…' : 'Run all scenarios'}
          </button>
        </div>
      </div>

      <div className="parity">
        <div className="parity-row head">
          <span>Scenario</span>
          <span>REST</span>
          <span>GraphQL</span>
          <span>Parity</span>
          <span />
        </div>
        {SCENARIOS.map((s) => {
          const r = results[s.id];
          const graphNote = !s.gql && !s.scripted ? s.gqlNote : null;
          let parity = null;
          if (r && r.graph) {
            if (s.gqlNull) parity = r.graph.ok && r.graph.data && r.graph.data.product === null ? 'by design' : 'differs';
            else parity = r.graph.code === r.rest.code ? 'match' : 'differs';
          } else if (r && graphNote) parity = 'REST only';
          return (
            <div key={s.id} className={`parity-row ${r ? 'done' : ''}`}>
              <span className="scenario">
                <b>{s.title}</b>
                <code className="code-tag ghost">{s.code}</code>
              </span>
              <span>
                <Outcome result={r && r.rest} paradigm="rest" />
                {r && r.rest && r.rest.hint && <small className="hint-line">{r.rest.hint}</small>}
                {r && r.rest && r.rest.details && r.rest.details.alternatives && (
                  <small className="hint-line">details.alternatives: {r.rest.details.alternatives.map((a) => a.slot_id).join(', ') || 'none'}</small>
                )}
                {r && r.steps && r.steps.length > 0 && (
                  <ul className="script-steps">
                    {r.steps.map((line) => (
                      <li key={line}>
                        <code>{line}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              <span>
                {graphNote ? (
                  <small className="muted">{graphNote}</small>
                ) : s.gqlNull && r && r.graph && r.graph.ok ? (
                  <span className="outcome">
                    <code className="code-tag ghost">product: null</code>
                    <small className="muted">{s.gqlNote}</small>
                  </span>
                ) : (
                  <Outcome result={r && r.graph} paradigm="gql" />
                )}
              </span>
              <span>{parity && <span className={`parity-tag ${parity.replace(' ', '-')}`}>{parity}</span>}</span>
              <span>
                <button type="button" className="btn ghost sm" onClick={() => runOne(s)} disabled={Boolean(running)}>
                  {running === s.id ? '…' : 'Run'}
                </button>
              </span>
            </div>
          );
        })}

        <div className={`parity-row ${limitRun ? 'done' : ''}`}>
          <span className="scenario">
            <b>Too many requests</b>
            <code className="code-tag ghost">RATE_LIMITED</code>
          </span>
          <span>
            {limitRun && limitRun.rest ? (
              <>
                <Outcome result={limitRun.rest} paradigm="rest" />
                <small className="hint-line">{limitRun.rest.hint}</small>
              </>
            ) : (
              <small className="muted">One fixed-window limiter (RateLimit-* headers, Retry-After on 429) guards both APIs.</small>
            )}
          </span>
          <span>{limitRun ? <Outcome result={limitRun.graph} paradigm="gql" /> : <small className="muted">Not run automatically.</small>}</span>
          <span>
            {limitRun && limitRun.rest && (
              <span className={`parity-tag ${limitRun.graph.code === 'RATE_LIMITED' ? 'match' : 'differs'}`}>
                {limitRun.graph.code === 'RATE_LIMITED' ? 'match' : 'differs'}
              </span>
            )}
          </span>
          <span>
            <button type="button" className="btn ghost sm danger-text" onClick={exhaustBudget} disabled={Boolean(running)}>
              {running === 'rate' ? '…' : 'Trigger'}
            </button>
          </span>
        </div>
        <div className="parity-row">
          <span className="scenario">
            <b>Unexpected server fault</b>
            <code className="code-tag ghost">INTERNAL</code>
          </span>
          <span className="span-3">
            <small className="muted">
              Any unhandled exception is logged server-side and returned as <code>500 INTERNAL</code> in the same envelope —
              never a stack trace. Not triggerable on purpose.
            </small>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Lab({ products }) {
  const [tab, setTab] = useState('usecases');
  return (
    <section className="container page">
      <div className="page-head">
        <span className="page-icon lab">
          <Icon name="flask" size={22} />
        </span>
        <div>
          <h1>API Lab</h1>
          <p>
            The contract behind the storefront, live: which actor uses which endpoint, what GraphQL saves over REST, and
            how both paradigms report the same errors. Open the API log (top right) to watch every request.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="API Lab sections">
        {TABS.map(([key, label, icon]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
        <a className="tab-link" href="/docs" target="_blank" rel="noreferrer">
          Swagger UI <Icon name="external" size={13} />
        </a>
        <a className="tab-link" href="/graphql" target="_blank" rel="noreferrer">
          GraphQL IDE <Icon name="external" size={13} />
        </a>
      </div>
      {tab === 'usecases' && <UseCases />}
      {tab === 'compare' && <Compare products={products} />}
      {tab === 'errors' && <ErrorParity />}
    </section>
  );
}
