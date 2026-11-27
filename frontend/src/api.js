// Instrumented client for the ShopMesh REST + GraphQL APIs. Relative URLs work
// behind the Express static server and the Vite proxy. Every request is
// recorded so the UI can show exactly which API call produced what is on screen.

const listeners = new Set();
let state = { calls: [], budget: null };
let seq = 0;

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export function clearLog() {
  state = { ...state, calls: [] };
  emit();
}

function record(entry) {
  state = { ...state, calls: [entry, ...state.calls].slice(0, 60) };
  emit();
}

function update(id, patch) {
  state = { ...state, calls: state.calls.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
  emit();
}

export class ApiError extends Error {
  constructor({ code, message, hint, details, status }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.hint = hint;
    this.details = details;
    this.status = status;
  }
}

// Credentials and tokens never reach the on-screen request log.
const SECRET_KEY = /^(password|token)$/i;
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) && typeof v === 'string' ? '••••••' : redact(v)])
  );
}

function readRateLimit(headers) {
  const limit = headers.get('RateLimit-Limit');
  if (limit === null) return null;
  return {
    limit: Number(limit),
    remaining: Number(headers.get('RateLimit-Remaining')),
    reset: Number(headers.get('RateLimit-Reset')),
  };
}

async function send({ kind, method, url, body, token, label }) {
  const id = ++seq;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  record({ id, kind, method, url, label, auth: Boolean(token), request: redact(body), at: Date.now(), pending: true });

  const t0 = performance.now();
  let res;
  let text = '';
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    text = await res.text();
  } catch {
    update(id, { pending: false, status: 0, ms: performance.now() - t0, bytes: 0 });
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'The ShopMesh API could not be reached.',
      hint: 'Check that the server is running (npm start or docker compose up), then retry.',
      status: 0,
    });
  }
  const ms = performance.now() - t0;
  const bytes = new TextEncoder().encode(text).length;
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const rateLimit = readRateLimit(res.headers);
  if (rateLimit) state = { ...state, budget: { ...rateLimit, at: Date.now() } };
  update(id, { pending: false, status: res.status, ms, bytes, response: redact(data), rateLimit });
  return { res, data, bytes, ms };
}

function errorFromRest(res, data) {
  const e = (data && data.error) || {};
  return new ApiError({
    code: e.code || `HTTP_${res.status}`,
    message: e.message || res.statusText || 'Request failed.',
    hint: e.hint,
    details: e.details,
    status: res.status,
  });
}

async function rest(method, url, { body, token, label } = {}) {
  const { res, data } = await send({ kind: 'REST', method, url, body, token, label });
  if (!res.ok) throw errorFromRest(res, data);
  return data;
}

export async function gql(query, variables, { token, label } = {}) {
  const { res, data } = await send({ kind: 'GraphQL', method: 'POST', url: '/graphql', body: { query, variables }, token, label });
  const first = data && data.errors && data.errors[0];
  if (first) {
    const ext = first.extensions || {};
    throw new ApiError({
      code: ext.code || 'GRAPHQL_ERROR',
      message: first.message,
      hint: ext.hint,
      details: ext.details,
      status: (ext.http && ext.http.status) || res.status,
    });
  }
  if (!res.ok || !data) throw new ApiError({ code: `HTTP_${res.status}`, message: 'GraphQL request failed.', status: res.status });
  return data.data;
}

// Probes never throw on API errors: they return what came back so the API Lab
// can put REST and GraphQL outcomes side by side.
export async function probeRest(method, url, { body, token, label } = {}) {
  const { res, data, bytes, ms } = await send({ kind: 'REST', method, url, body, token, label });
  const e = data && data.error;
  return {
    ok: res.ok,
    status: res.status,
    code: e ? e.code : null,
    message: e ? e.message : null,
    hint: e ? e.hint : null,
    details: e ? e.details : null,
    data,
    bytes,
    ms,
  };
}

export async function probeGql(query, variables, { token, label } = {}) {
  const { res, data, bytes, ms } = await send({ kind: 'GraphQL', method: 'POST', url: '/graphql', body: { query, variables }, token, label });
  const err = data && data.errors && data.errors[0];
  const ext = (err && err.extensions) || {};
  return {
    ok: !err,
    status: res.status,
    httpStatus: ext.http ? ext.http.status : null,
    code: err ? ext.code || 'GRAPHQL_ERROR' : null,
    message: err ? err.message : null,
    hint: ext.hint || null,
    details: ext.details || null,
    data: data && data.data,
    bytes,
    ms,
  };
}

const enc = encodeURIComponent;
export function qs(params = {}) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const api = {
  login: (username, password) =>
    rest('POST', '/api/v1/auth/token', { body: { username, password }, label: 'Sign in' }),
  register: (username, password, email) =>
    rest('POST', '/api/v1/auth/register', { body: { username, password, email }, label: 'Register' }),
  listProducts: (params, label = 'List API') => rest('GET', `/api/v1/products${qs(params)}`, { label }),
  getProduct: (id) => rest('GET', `/api/v1/products/${enc(id)}`, { label: 'Product detail' }),
  productSlots: (id) => rest('GET', `/api/v1/products/${enc(id)}/slots`, { label: 'Product slots' }),
  mapRadius: ({ latitude, longitude, radius_km }) =>
    rest('GET', `/api/v1/products/map${qs({ latitude, longitude, radius_km })}`, { label: 'Map API · radius' }),
  mapBox: ({ min_lat, min_lon, max_lat, max_lon }, label = 'Map API · bounding box') =>
    rest('GET', `/api/v1/products/map${qs({ min_lat, min_lon, max_lat, max_lon })}`, { label }),
  slots: (params) => rest('GET', `/api/v1/slots${qs(params)}`, { label: 'Calendar API' }),
  book: (token, slotId, quantity = 1) =>
    rest('POST', '/api/v1/bookings', { body: { slot_id: slotId, quantity }, token, label: 'Book slot' }),
  cancelBooking: (token, id) => rest('DELETE', `/api/v1/bookings/${enc(id)}`, { token, label: 'Cancel booking' }),
  adminStats: (token) => rest('GET', '/api/v1/admin/stats', { token, label: 'Admin stats' }),
  createProduct: (token, body) => rest('POST', '/api/v1/products', { body, token, label: 'Create product' }),
  updateProduct: (token, id, body) =>
    rest('PATCH', `/api/v1/products/${enc(id)}`, { body, token, label: 'Update product' }),
  deleteProduct: (token, id) => rest('DELETE', `/api/v1/products/${enc(id)}`, { token, label: 'Delete product' }),
  ready: () => rest('GET', '/ready', { label: 'Readiness probe' }),
};
