import React, { useEffect, useState, useCallback } from 'react';
import * as api from './api.js';

const CATEGORIES = ['', 'Electronics', 'Fashion', 'Home & Kitchen', 'Books', 'Grocery', 'Sports', 'Beauty'];
const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;

function Header({ tab, setTab, token, onLogout }) {
  return (
    <header className="hdr">
      <div className="brand">ShopMesh <span className="tag">APIBP002</span></div>
      <nav>
        {['browse', 'nearby', 'bookings'].map((t) => (
          <button key={t} className={tab === t ? 'nav active' : 'nav'} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="auth">
        {token ? (
          <>
            <span className="pill ok">signed in</span>
            <button className="link" onClick={onLogout}>sign out</button>
          </>
        ) : (
          <span className="pill">guest</span>
        )}
      </div>
    </header>
  );
}

function ProductCard({ p }) {
  return (
    <article className="card">
      <div className="card-top">
        <h3>{p.name}</h3>
        <span className={`status ${p.status}`}>{p.status.replace('_', ' ')}</span>
      </div>
      <p className="muted">{p.category} · {p.seller}</p>
      <p className="desc">{p.description}</p>
      <div className="card-bot">
        <strong>{inr(p.price_paise)}</strong>
        {p.rating != null && <span className="rating">★ {p.rating}</span>}
        {p.distance_km != null && <span className="dist">{p.distance_km} km away</span>}
      </div>
    </article>
  );
}

function Browse() {
  const [filters, setFilters] = useState({ status: '', category: '', min_price: '', max_price: '', sort: 'created_at', order: 'desc' });
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (reset) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProducts({ ...filters, limit: 9, after: reset ? undefined : cursor });
      setItems((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch (e) {
      setError(`${e.code}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [filters, cursor]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [filters]);

  const upd = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section>
      <div className="filters">
        <select value={filters.status} onChange={upd('status')}>
          <option value="">any status</option>
          <option value="active">active</option>
          <option value="out_of_stock">out of stock</option>
          <option value="discontinued">discontinued</option>
        </select>
        <select value={filters.category} onChange={upd('category')}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || 'any category'}</option>)}
        </select>
        <input type="number" placeholder="min ₹" value={filters.min_price} onChange={upd('min_price')} />
        <input type="number" placeholder="max ₹" value={filters.max_price} onChange={upd('max_price')} />
        <select value={filters.sort} onChange={upd('sort')}>
          <option value="created_at">newest</option>
          <option value="price">price</option>
          <option value="rating">rating</option>
          <option value="name">name</option>
        </select>
        <select value={filters.order} onChange={upd('order')}>
          <option value="desc">desc</option>
          <option value="asc">asc</option>
        </select>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="grid">
        {items.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
      <div className="more">
        {hasMore ? (
          <button disabled={loading} onClick={() => load(false)}>{loading ? 'loading…' : 'Load more'}</button>
        ) : (
          <span className="muted">{items.length} products</span>
        )}
      </div>
    </section>
  );
}

function Nearby() {
  const [form, setForm] = useState({ latitude: '12.9716', longitude: '77.5946', radius_km: '500' });
  const [hits, setHits] = useState([]);
  const [error, setError] = useState(null);
  const search = async () => {
    setError(null);
    try {
      const res = await api.productsNearby(form);
      setHits(res.data);
    } catch (e) {
      setError(`${e.code}: ${e.message}`);
    }
  };
  useEffect(() => { search(); /* eslint-disable-next-line */ }, []);
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <section>
      <div className="filters">
        <input value={form.latitude} onChange={upd('latitude')} placeholder="latitude" />
        <input value={form.longitude} onChange={upd('longitude')} placeholder="longitude" />
        <input value={form.radius_km} onChange={upd('radius_km')} placeholder="radius km" />
        <button onClick={search}>Search nearby</button>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="grid">{hits.map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
  );
}

function Bookings({ token, setToken }) {
  const [creds, setCreds] = useState({ username: 'demo', password: 'demo-password' });
  const [productId, setProductId] = useState('prod_001');
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [msg, setMsg] = useState(null);

  const doLogin = async () => {
    setMsg(null);
    try {
      const res = await api.login(creds.username, creds.password);
      setToken(res.token);
      setMsg('Signed in.');
    } catch (e) { setMsg(`${e.code}: ${e.message}`); }
  };
  const loadSlots = async () => {
    setMsg(null);
    try { setSlots((await api.productSlots(productId)).data); }
    catch (e) { setMsg(`${e.code}: ${e.message}`); }
  };
  const book = async (slotId) => {
    setMsg(null);
    try {
      const res = await api.bookSlot(slotId, token);
      setMsg(`Booked ✓ ${res.created.id}`);
      if (token) setBookings((await api.myBookings(token)).data);
      loadSlots();
    } catch (e) { setMsg(`${e.code}: ${e.message}`); }
  };
  useEffect(() => { loadSlots(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (token) api.myBookings(token).then((r) => setBookings(r.data)).catch(() => {}); }, [token]);

  return (
    <section>
      {!token && (
        <div className="filters">
          <input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} />
          <input type="password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
          <button onClick={doLogin}>Sign in</button>
        </div>
      )}
      <div className="filters">
        <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="product id" />
        <button onClick={loadSlots}>Load slots</button>
      </div>
      {msg && <div className="err">{msg}</div>}
      <table className="slots">
        <thead><tr><th>Slot</th><th>Window (UTC)</th><th>Available</th><th></th></tr></thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{new Date(s.starts_at).toUTCString().slice(5, 22)} → {new Date(s.ends_at).toUTCString().slice(17, 22)}</td>
              <td>{s.available}/{s.capacity}</td>
              <td><button disabled={!token || s.available <= 0} onClick={() => book(s.id)}>Book</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {bookings.length > 0 && (
        <>
          <h4>My bookings</h4>
          <ul className="bookings">{bookings.map((b) => <li key={b.id}>{b.id} · {b.slot_id} · ×{b.quantity}</li>)}</ul>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState('browse');
  const [token, setToken] = useState(null);
  return (
    <div className="app">
      <Header tab={tab} setTab={setTab} token={token} onLogout={() => setToken(null)} />
      <main>
        {tab === 'browse' && <Browse />}
        {tab === 'nearby' && <Nearby />}
        {tab === 'bookings' && <Bookings token={token} setToken={setToken} />}
      </main>
      <footer className="ftr">
        ShopMesh · REST <code>/api/v1</code> · GraphQL <code>/graphql</code> · Docs <code>/docs</code>
      </footer>
    </div>
  );
}
