import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import ErrorNote from '../components/ErrorNote.jsx';
import { CATEGORIES, STATUSES, productIcon, statusLabel } from '../lib/catalog.js';
import { money } from '../lib/format.js';
import { useDebounced } from '../lib/hooks.js';

const PAGE_SIZE = 15;
const BLANK = { name: '', category: CATEGORIES[0], status: 'active', price: '', inventory: '', rating: '', hub: '', latitude: '', longitude: '', description: '' };

function Locked({ session, requireLogin }) {
  return (
    <section className="container page">
      <div className="empty tall locked">
        <div className="empty-emoji">🛡️</div>
        <h3>Admin console needs the admin role</h3>
        <p>
          {session ? (
            <>
              You are signed in as <b>{session.username}</b> ({session.role}). The admin routes would answer{' '}
              <code>403 FORBIDDEN</code> to this token.
            </>
          ) : (
            <>
              Admin routes answer <code>401 UNAUTHENTICATED</code> without a token and <code>403 FORBIDDEN</code> for a
              customer token.
            </>
          )}
        </p>
        <button type="button" className="btn primary" onClick={requireLogin}>
          <Icon name="key" size={16} /> Sign in as admin
        </button>
      </div>
    </section>
  );
}

function StatusBar({ byStatus, total }) {
  return (
    <div className="status-bar-wrap">
      <div className="status-bar" aria-hidden="true">
        {STATUSES.map((s) => (
          <span key={s.value} className={s.value} style={{ width: `${total ? ((byStatus[s.value] || 0) / total) * 100 : 0}%` }} />
        ))}
      </div>
      <div className="status-legend">
        {STATUSES.map((s) => (
          <span key={s.value}>
            <i className={s.value} /> {s.label} <b>{byStatus[s.value] || 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Console({ session, toast, hubs, onCatalogueChange }) {
  const { token } = session;
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 350);
  const [table, setTable] = useState({ items: [], cursor: null, hasMore: false, total: null });
  const [tableError, setTableError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});
  const [rowError, setRowError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);
  const requestId = useRef(0);

  const loadStats = useCallback(async () => {
    try {
      setStats((await api.adminStats(token)).stats);
      setStatsError(null);
    } catch (e) {
      setStatsError(e);
    }
  }, [token]);

  const loadTable = useCallback(
    async (after) => {
      const mine = ++requestId.current;
      setLoading(true);
      setTableError(null);
      try {
        const res = await api.listProducts({ q: term, sort: 'name', order: 'asc', limit: PAGE_SIZE, after }, 'Admin · catalogue');
        if (mine !== requestId.current) return;
        setTable((prev) => ({
          items: after ? [...prev.items, ...res.data] : res.data,
          cursor: res.next_cursor,
          hasMore: res.has_more,
          total: res.total_count,
        }));
      } catch (e) {
        if (mine === requestId.current) setTableError(e);
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    },
    [term]
  );

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadTable(undefined);
  }, [loadTable]);

  useEffect(() => {
    if (!form.hub && hubs.length) {
      const h = hubs[0];
      setForm((f) => ({ ...f, hub: h.key, latitude: String(h.lat), longitude: String(h.lon) }));
    }
  }, [hubs, form.hub]);

  const refreshAll = () => {
    loadStats();
    onCatalogueChange();
  };

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pickHub = (e) => {
    const key = e.target.value;
    const h = hubs.find((x) => x.key === key);
    setForm((f) => ({ ...f, hub: key, ...(h ? { latitude: String(h.lat), longitude: String(h.lon) } : {}) }));
  };

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    const hub = hubs.find((h) => h.key === form.hub);
    const body = {
      name: form.name.trim(),
      category: form.category,
      status: form.status,
      price: form.price === '' ? undefined : Number(form.price),
      inventory: form.inventory === '' ? undefined : Number(form.inventory),
      rating: form.rating === '' ? undefined : Number(form.rating),
      seller: hub ? hub.seller : undefined,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      description: form.description.trim() || undefined,
    };
    try {
      const res = await api.createProduct(token, body);
      toast({ kind: 'ok', title: 'Product created', body: `${res.created.name} · ${res.created.id}` });
      setForm({ ...BLANK, hub: form.hub, latitude: form.latitude, longitude: form.longitude });
      loadTable(undefined);
      refreshAll();
    } catch (err) {
      setFormError(err);
    } finally {
      setCreating(false);
    }
  };

  const editOf = (p) => edits[p.id] || {};
  const setEdit = (id, key, value) => setEdits((all) => ({ ...all, [id]: { ...all[id], [key]: value } }));

  const changesFor = (p) => {
    const e = editOf(p);
    const patch = {};
    if (e.status !== undefined && e.status !== p.status) patch.status = e.status;
    if (e.price !== undefined && e.price !== '' && Math.round(Number(e.price) * 100) !== p.price_paise) patch.price = Number(e.price);
    if (e.inventory !== undefined && e.inventory !== '' && Number(e.inventory) !== p.inventory) patch.inventory = Number(e.inventory);
    return patch;
  };

  const save = async (p) => {
    const patch = changesFor(p);
    setRowError(null);
    try {
      const res = await api.updateProduct(token, p.id, patch);
      setTable((t) => ({ ...t, items: t.items.map((x) => (x.id === p.id ? res.updated : x)) }));
      setEdits((all) => {
        const next = { ...all };
        delete next[p.id];
        return next;
      });
      toast({ kind: 'ok', title: 'Saved', body: `${res.updated.name}: ${Object.keys(patch).join(', ')} updated` });
      refreshAll();
    } catch (err) {
      setRowError({ id: p.id, error: err });
    }
  };

  const remove = async (p) => {
    setRowError(null);
    try {
      await api.deleteProduct(token, p.id);
      toast({ kind: 'ok', title: 'Product deleted', body: `${p.name} and its slots/bookings were removed.` });
      setConfirmDelete('');
      setTable((t) => ({ ...t, items: t.items.filter((x) => x.id !== p.id), total: t.total != null ? t.total - 1 : t.total }));
      refreshAll();
    } catch (err) {
      setRowError({ id: p.id, error: err });
    }
  };

  const total = stats ? stats.products : 0;

  return (
    <section className="container page">
      <div className="page-head">
        <span className="page-icon admin">
          <Icon name="shield" size={22} />
        </span>
        <div>
          <h1>Admin console</h1>
          <p>
            Signed in as <b>{session.username}</b> with the <span className="role-badge admin">admin</span> role. A customer
            token gets <code>403 FORBIDDEN</code> on every call made from this page.
          </p>
        </div>
      </div>

      {statsError && <ErrorNote error={statsError} onRetry={loadStats} />}
      <div className="kpis six">
        <div className="kpi">
          <span>Products</span>
          <b>{stats ? stats.products : '—'}</b>
        </div>
        <div className="kpi">
          <span>Units in stock</span>
          <b>{stats ? stats.total_inventory.toLocaleString('en-IN') : '—'}</b>
        </div>
        <div className="kpi">
          <span>Σ list prices</span>
          <b>{stats ? money(stats.catalogue_value_paise) : '—'}</b>
        </div>
        <div className="kpi">
          <span>Bookings</span>
          <b>{stats ? stats.bookings : '—'}</b>
        </div>
        <div className="kpi warn">
          <span>Low stock (&lt; 30)</span>
          <b>{stats ? stats.low_stock : '—'}</b>
        </div>
        <div className="kpi bad">
          <span>Out of stock</span>
          <b>{stats ? stats.out_of_stock : '—'}</b>
        </div>
      </div>
      {stats && <StatusBar byStatus={stats.by_status} total={total} />}
      <code className="query-echo block">GET /api/v1/admin/stats · Authorization: Bearer ••••••</code>

      <div className="admin-grid">
        <form className="card pad admin-form" onSubmit={create}>
          <h2>
            <Icon name="plus" size={18} /> Add a product
          </h2>
          <label className="label">
            Name
            <input className="field" value={form.name} onChange={setField('name')} placeholder="e.g. Monsoon Trek Backpack" required />
          </label>
          <div className="two">
            <label className="label">
              Category
              <select className="field" value={form.category} onChange={setField('category')}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="label">
              Status
              <select className="field" value={form.status} onChange={setField('status')}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="three">
            <label className="label">
              Price (₹)
              <input className="field" type="number" step="0.01" value={form.price} onChange={setField('price')} placeholder="2499" />
            </label>
            <label className="label">
              Stock
              <input className="field" type="number" value={form.inventory} onChange={setField('inventory')} placeholder="0" />
            </label>
            <label className="label">
              Rating
              <input className="field" type="number" step="0.1" value={form.rating} onChange={setField('rating')} placeholder="0–5" />
            </label>
          </div>
          <label className="label">
            Fulfilment hub
            <select className="field" value={form.hub} onChange={pickHub}>
              {hubs.map((h) => (
                <option key={h.key} value={h.key}>
                  {h.city} ({h.lat}, {h.lon})
                </option>
              ))}
              <option value="custom">Custom coordinates…</option>
            </select>
          </label>
          {form.hub === 'custom' && (
            <div className="two">
              <label className="label">
                Latitude
                <input className="field" value={form.latitude} onChange={setField('latitude')} placeholder="18.5204" />
              </label>
              <label className="label">
                Longitude
                <input className="field" value={form.longitude} onChange={setField('longitude')} placeholder="73.8567" />
              </label>
            </div>
          )}
          <label className="label">
            Description
            <textarea className="field" rows="2" value={form.description} onChange={setField('description')} placeholder="Optional" />
          </label>
          {formError && <ErrorNote error={formError} compact />}
          <button type="submit" className="btn primary block" disabled={creating}>
            {creating ? 'Creating…' : 'Create product'}
          </button>
          <small className="muted">
            <code>POST /api/v1/products</code> · the server validates every field and answers with the error code + hint.
          </small>
        </form>

        <div className="card admin-table-card">
          <div className="admin-table-head">
            <h2>
              Catalogue <span className="muted">{table.total != null ? `(${table.total})` : ''}</span>
            </h2>
            <label className="search sm">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalogue" />
            </label>
          </div>
          {tableError && <ErrorNote error={tableError} onRetry={() => loadTable(undefined)} />}
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Price ₹</th>
                  <th>Stock</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {table.items.map((p) => {
                  const e = editOf(p);
                  const dirty = Object.keys(changesFor(p)).length > 0;
                  return (
                    <React.Fragment key={p.id}>
                      <tr className={dirty ? 'dirty' : ''}>
                        <td>
                          <div className="cell-product">
                            <span aria-hidden="true">{productIcon(p)}</span>
                            <div>
                              <b>{p.name}</b>
                              <small>
                                {p.category} · <code>{p.id}</code>
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select className={`field sm status-select ${e.status ?? p.status}`} value={e.status ?? p.status} onChange={(ev) => setEdit(p.id, 'status', ev.target.value)} aria-label={`Status of ${p.name}`}>
                            {STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {statusLabel(s.value)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="field sm num" type="number" step="0.01" value={e.price ?? p.price_paise / 100} onChange={(ev) => setEdit(p.id, 'price', ev.target.value)} aria-label={`Price of ${p.name}`} />
                        </td>
                        <td>
                          <input className="field sm num short" type="number" value={e.inventory ?? p.inventory} onChange={(ev) => setEdit(p.id, 'inventory', ev.target.value)} aria-label={`Stock of ${p.name}`} />
                        </td>
                        <td className="row-actions">
                          <button type="button" className="btn primary sm" disabled={!dirty} onClick={() => save(p)}>
                            Save
                          </button>
                          {confirmDelete === p.id ? (
                            <>
                              <button type="button" className="btn danger sm" onClick={() => remove(p)}>
                                Delete?
                              </button>
                              <button type="button" className="icon-btn sm" onClick={() => setConfirmDelete('')} aria-label="Keep product">
                                <Icon name="x" size={14} />
                              </button>
                            </>
                          ) : (
                            <button type="button" className="icon-btn sm danger-text" onClick={() => setConfirmDelete(p.id)} aria-label={`Delete ${p.name}`}>
                              <Icon name="trash" size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {rowError && rowError.id === p.id && (
                        <tr className="row-error-tr">
                          <td colSpan={5}>
                            <ErrorNote error={rowError.error} compact />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span className="muted small">
              {table.items.length} of {table.total ?? '…'} · sorted by name · cursor-paginated
            </span>
            {table.hasMore && (
              <button type="button" className="btn ghost sm" onClick={() => loadTable(table.cursor)} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Admin(props) {
  const { session, requireLogin } = props;
  if (!session || session.role !== 'admin') return <Locked session={session} requireLogin={requireLogin} />;
  return <Console {...props} />;
}
