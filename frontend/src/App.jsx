import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as api from './api.js';

const MOTIF = {
  Electronics: '🎧', Fashion: '👟', 'Home & Kitchen': '🍳', Books: '📚',
  Grocery: '🫙', Sports: '🏋️', Beauty: '✨',
};
const TINT = {
  Electronics: '#e6eef2', Fashion: '#f3ebe3', 'Home & Kitchen': '#eaf1ec', Books: '#efe9f2',
  Grocery: '#f1efe0', Sports: '#e9eef3', Beauty: '#f6eaf0',
};
const motif = (c) => MOTIF[c] || '🛍️';
const tint = (c) => TINT[c] || '#f0ece3';
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const cityOf = (seller) => (seller || '').replace(/\s*Fulfilment Hub$/, '') || '—';
const slotWhen = (s) => {
  const d = new Date(s.starts_at);
  const e = new Date(s.ends_at);
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const t = (x) => x.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
  return `${day} · ${t(d)}–${t(e)} UTC`;
};

function Card({ p, onOpen }) {
  return (
    <button className="card" onClick={() => onOpen(p)}>
      <div className="thumb" style={{ background: tint(p.category) }}>{motif(p.category)}</div>
      <div className="card-body">
        <span className={`chip ${p.status}`}>{p.status.replace(/_/g, ' ')}</span>
        <h3>{p.name}</h3>
        <div className="meta">{p.category} · {cityOf(p.seller)}</div>
        <div className="row">
          <span className="price">{rupees(p.price_paise)}</span>
          {p.rating != null && <span className="rating">★ {p.rating}</span>}
          {p.distance_km != null && <span className="dist">{p.distance_km} km</span>}
        </div>
      </div>
    </button>
  );
}

function Drawer({ product, token, onClose, toast, requireLogin }) {
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { setSlots((await api.productSlots(product.id)).data); }
    catch (e) { toast(`${e.code}: ${e.message}`, 'err'); }
  }, [product.id, toast]);
  useEffect(() => { load(); }, [load]);

  const book = async (slot) => {
    if (!token) { requireLogin(); return; }
    setBusy(slot.id);
    try {
      const res = await api.bookSlot(slot.id, token);
      toast(`Booked — order ${res.created.id.slice(0, 12)}…`, 'ok');
      load();
    } catch (e) { toast(`${e.code}: ${e.message}`, 'err'); }
    finally { setBusy(''); }
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={product.name}>
        <div className="drawer-head">
          <button className="x" onClick={onClose} aria-label="Close">×</button>
          <div style={{ fontSize: 34 }}>{motif(product.category)}</div>
          <h2 className="display">{product.name}</h2>
          <div className="meta">{product.category} · {cityOf(product.seller)} · <b>{rupees(product.price_paise)}</b></div>
        </div>
        <div className="drawer-body">
          {product.description && <p style={{ color: 'var(--ink-soft)' }}>{product.description}</p>}
          <h4>Delivery slots</h4>
          {slots === null && <div className="meta">Loading slots…</div>}
          {slots && slots.length === 0 && <div className="meta">No slots for this product.</div>}
          {slots && slots.map((s) => {
            const full = s.available <= 0;
            return (
              <div className="slot" key={s.id}>
                <div>
                  <div className="when">{slotWhen(s)}</div>
                  <div className="cap">{full ? 'Fully booked' : `${s.available} of ${s.capacity} left`}</div>
                </div>
                <button
                  className={`solid book ${full ? 'full' : ''}`}
                  disabled={full || busy === s.id}
                  onClick={() => book(s)}
                >
                  {full ? 'Full' : busy === s.id ? '…' : token ? 'Book' : 'Sign in to book'}
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function Browse({ onOpen, cityCounts, total }) {
  const [f, setF] = useState({ status: '', category: '', min_price: '', max_price: '', sort: 'created_at', order: 'desc' });
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (reset) => {
    setLoading(true);
    try {
      const res = await api.listProducts({ ...f, limit: 9, after: reset ? undefined : cursor });
      setItems((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.next_cursor);
      setHasMore(res.has_more);
    } finally { setLoading(false); }
  }, [f, cursor]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [f]);
  const upd = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <div className="hero">
        <h1 className="display">Shop the mesh. Delivered on your slot.</h1>
        <p>A marketplace stitched across {cityCounts.length} Indian fulfilment hubs — browse {total} products and book the exact delivery window that fits your day.</p>
        <div className="cities">
          {cityCounts.map((c) => (
            <span className="city-chip" key={c.city}><span className="pin" /><b>{c.city}</b> <span className="n">{c.n}</span></span>
          ))}
        </div>
      </div>
      <div className="wrap">
        <div className="controls">
          <select className="field" value={f.status} onChange={upd('status')} aria-label="Status">
            <option value="">All status</option><option value="active">Active</option>
            <option value="out_of_stock">Out of stock</option><option value="discontinued">Discontinued</option>
          </select>
          <select className="field" value={f.category} onChange={upd('category')} aria-label="Category">
            <option value="">All categories</option>
            {['Electronics', 'Fashion', 'Home & Kitchen', 'Books', 'Grocery', 'Sports', 'Beauty'].map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="field" type="number" placeholder="Min ₹" value={f.min_price} onChange={upd('min_price')} style={{ width: 92 }} />
          <input className="field" type="number" placeholder="Max ₹" value={f.max_price} onChange={upd('max_price')} style={{ width: 92 }} />
          <select className="field" value={f.sort} onChange={upd('sort')} aria-label="Sort by">
            <option value="created_at">Newest</option><option value="price">Price</option>
            <option value="rating">Rating</option><option value="name">Name</option>
          </select>
          <select className="field" value={f.order} onChange={upd('order')} aria-label="Order">
            <option value="desc">Desc</option><option value="asc">Asc</option>
          </select>
          <span className="count-note">{items.length} shown{hasMore ? ' · more available' : ''}</span>
        </div>
        {items.length === 0 && !loading && <div className="empty">No products match these filters.</div>}
        <div className="grid">{items.map((p) => <Card key={p.id} p={p} onOpen={onOpen} />)}</div>
        {hasMore && (
          <div className="more"><button className="ghost" disabled={loading} onClick={() => load(false)}>{loading ? 'Loading…' : 'Load more'}</button></div>
        )}
      </div>
    </>
  );
}

function Nearby({ onOpen, toast }) {
  const [form, setForm] = useState({ latitude: '12.9716', longitude: '77.5946', radius_km: '800' });
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const search = useCallback(async () => {
    setLoading(true);
    try { setHits((await api.productsNearby(form)).data); }
    catch (e) { toast(`${e.code}: ${e.message}`, 'err'); }
    finally { setLoading(false); }
  }, [form, toast]);
  useEffect(() => { search(); /* eslint-disable-next-line */ }, []);
  const upd = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const locate = () => {
    if (!navigator.geolocation) { toast('Geolocation not available', 'err'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((p) => ({ ...p, latitude: pos.coords.latitude.toFixed(4), longitude: pos.coords.longitude.toFixed(4) })),
      () => toast('Could not read your location', 'err')
    );
  };
  return (
    <div className="wrap" style={{ paddingTop: 28 }}>
      <h1 className="display" style={{ fontSize: 30, margin: '8px 0 16px', letterSpacing: '-0.02em' }}>Products near you</h1>
      <div className="controls" style={{ position: 'static' }}>
        <button className="ghost" onClick={locate}>Use my location</button>
        <input className="field" value={form.latitude} onChange={upd('latitude')} aria-label="Latitude" style={{ width: 110 }} />
        <input className="field" value={form.longitude} onChange={upd('longitude')} aria-label="Longitude" style={{ width: 110 }} />
        <input className="field" value={form.radius_km} onChange={upd('radius_km')} aria-label="Radius km" style={{ width: 100 }} />
        <button className="solid" onClick={search} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        <span className="count-note">{hits.length} within {form.radius_km} km</span>
      </div>
      {hits.length === 0 && !loading && <div className="empty">No products in range. Widen the radius or pick another point.</div>}
      <div className="grid">{hits.map((p) => <Card key={p.id} p={p} onOpen={onOpen} />)}</div>
    </div>
  );
}

function Orders({ token, requireLogin }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!token) return;
    api.myBookings(token).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [token]);
  if (!token) {
    return <div className="wrap"><div className="empty">Sign in to see your delivery bookings.<br /><br /><button className="solid" onClick={requireLogin}>Sign in</button></div></div>;
  }
  return (
    <div className="wrap" style={{ paddingTop: 28 }}>
      <h1 className="display" style={{ fontSize: 30, margin: '8px 0 16px', letterSpacing: '-0.02em' }}>My orders</h1>
      {rows.length === 0 ? <div className="empty">No bookings yet. Book a delivery slot from any product.</div> : (
        <div className="grid">
          {rows.map((b) => (
            <div className="card" key={b.id} style={{ padding: 16 }}>
              <div className="meta">Order</div>
              <h3 style={{ fontFamily: 'Bricolage Grotesque', fontSize: 15 }}>{b.id}</h3>
              <div className="meta">Slot {b.slot_id} · ×{b.quantity}</div>
              <div className="meta">{new Date(b.created_at).toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoginModal({ onClose, onDone, toast }) {
  const [c, setC] = useState({ username: 'demo', password: 'demo-password' });
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await api.login(c.username, c.password); onDone(r.token); toast('Signed in', 'ok'); onClose(); }
    catch (err) { toast(`${err.code}: ${err.message}`, 'err'); }
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="modal-card" onSubmit={submit}>
        <h2 className="display">Sign in</h2>
        <p>Use the demo account <b>demo</b> / <b>demo-password</b>, or an admin account.</p>
        <label>Username<input className="field" value={c.username} onChange={(e) => setC({ ...c, username: e.target.value })} /></label>
        <label>Password<input className="field" type="password" value={c.password} onChange={(e) => setC({ ...c, password: e.target.value })} /></label>
        <button className="solid" type="submit">Sign in</button>
      </form>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState('browse');
  const [token, setToken] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [all, setAll] = useState([]);

  const toast = useCallback((msg, kind) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  useEffect(() => { api.listProducts({ limit: 100 }).then((r) => setAll(r.data)).catch(() => {}); }, []);

  const { cityCounts } = useMemo(() => {
    const m = new Map();
    all.forEach((p) => { const c = cityOf(p.seller); m.set(c, (m.get(c) || 0) + 1); });
    return { cityCounts: [...m.entries()].map(([city, n]) => ({ city, n })).sort((a, b) => b.n - a.n) };
  }, [all]);

  const requireLogin = () => setLoginOpen(true);

  return (
    <>
      <header className="masthead">
        <div className="wordmark">ShopMesh<span className="dot">.</span><span className="rid">APIBP002</span></div>
        <nav className="tabs" role="tablist">
          {[['browse', 'Browse'], ['nearby', 'Near me'], ['orders', 'My orders']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="mast-right">
          {token
            ? <><span className="who">Signed in as <b>demo</b></span><button className="ghost" onClick={() => { setToken(null); toast('Signed out'); }}>Sign out</button></>
            : <button className="solid" onClick={requireLogin}>Sign in</button>}
        </div>
      </header>

      {tab === 'browse' && <Browse onOpen={setDrawer} cityCounts={cityCounts} total={all.length} />}
      {tab === 'nearby' && <Nearby onOpen={setDrawer} toast={toast} />}
      {tab === 'orders' && <Orders token={token} requireLogin={requireLogin} />}

      <footer className="ftr">
        One service, two APIs — REST <code>/api/v1</code> · GraphQL <code>/graphql</code> · OpenAPI <code>/docs</code>
      </footer>

      {drawer && <Drawer product={drawer} token={token} onClose={() => setDrawer(null)} toast={toast} requireLogin={requireLogin} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onDone={setToken} toast={toast} />}

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.msg}</div>)}
      </div>
    </>
  );
}
