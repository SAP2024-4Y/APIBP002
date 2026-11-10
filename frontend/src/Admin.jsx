import React, { useEffect, useState, useCallback } from 'react';
import * as api from './api.js';

const CATS = ['Electronics', 'Fashion', 'Home & Kitchen', 'Books', 'Grocery', 'Sports', 'Beauty'];
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const BLANK = { name: '', category: 'Electronics', status: 'active', price: '', inventory: '', latitude: '12.9716', longitude: '77.5946' };

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-v">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

export default function Admin({ token, toast }) {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [edit, setEdit] = useState({});

  const reload = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.adminStats(token), api.listProducts({ limit: 100, sort: 'name', order: 'asc' })]);
      setStats(s.stats);
      setRows(list.data);
    } catch (e) { toast(`${e.code}: ${e.message}`, 'err'); }
  }, [token, toast]);

  useEffect(() => { reload(); }, [reload]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createProduct(token, { ...form, price: Number(form.price), inventory: Number(form.inventory || 0), latitude: Number(form.latitude), longitude: Number(form.longitude) });
      toast(`Created ${res.created.name}`, 'ok');
      setForm(BLANK);
      reload();
    } catch (e2) { toast(`${e2.code}: ${e2.message}`, 'err'); }
  };

  const save = async (id) => {
    const patch = edit[id];
    if (!patch) return;
    try {
      await api.updateProduct(token, id, { ...patch, price: patch.price !== undefined ? Number(patch.price) : undefined, inventory: patch.inventory !== undefined ? Number(patch.inventory) : undefined });
      toast('Saved', 'ok');
      setEdit((e) => { const n = { ...e }; delete n[id]; return n; });
      reload();
    } catch (e) { toast(`${e.code}: ${e.message}`, 'err'); }
  };

  const remove = async (id, name) => {
    try { await api.deleteProduct(token, id); toast(`Deleted ${name}`, 'ok'); reload(); }
    catch (e) { toast(`${e.code}: ${e.message}`, 'err'); }
  };

  const setField = (id, k, v) => setEdit((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const upd = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="wrap" style={{ paddingTop: 24 }}>
      <h1 className="display" style={{ fontSize: 30, margin: '8px 0 18px', letterSpacing: '-0.02em' }}>Admin console</h1>

      {stats && (
        <div className="stats">
          <Stat label="Products" value={stats.products} />
          <Stat label="In stock (units)" value={stats.total_inventory.toLocaleString('en-IN')} />
          <Stat label="Catalogue value" value={rupees(stats.catalogue_value_paise)} />
          <Stat label="Bookings" value={stats.bookings} />
          <Stat label="Low stock" value={stats.low_stock} />
          <Stat label="Out of stock" value={stats.out_of_stock} />
        </div>
      )}

      <h4 className="admin-h">Add a product</h4>
      <form className="admin-form" onSubmit={create}>
        <input className="field" placeholder="Name" value={form.name} onChange={upd('name')} required />
        <select className="field" value={form.category} onChange={upd('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="field" value={form.status} onChange={upd('status')}>
          <option value="active">active</option><option value="out_of_stock">out_of_stock</option><option value="discontinued">discontinued</option>
        </select>
        <input className="field" type="number" placeholder="Price ₹" value={form.price} onChange={upd('price')} required style={{ width: 100 }} />
        <input className="field" type="number" placeholder="Stock" value={form.inventory} onChange={upd('inventory')} style={{ width: 90 }} />
        <input className="field" placeholder="lat" value={form.latitude} onChange={upd('latitude')} style={{ width: 90 }} />
        <input className="field" placeholder="lon" value={form.longitude} onChange={upd('longitude')} style={{ width: 90 }} />
        <button className="solid" type="submit">Create</button>
      </form>

      <h4 className="admin-h">Catalogue ({rows.length})</h4>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Product</th><th>Status</th><th>Price ₹</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const e = edit[p.id] || {};
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="meta">{p.category} · {p.id}</div></td>
                  <td>
                    <select className="field sm" value={e.status ?? p.status} onChange={(ev) => setField(p.id, 'status', ev.target.value)}>
                      <option value="active">active</option><option value="out_of_stock">out_of_stock</option><option value="discontinued">discontinued</option>
                    </select>
                  </td>
                  <td><input className="field sm" type="number" value={e.price ?? (p.price_paise / 100)} onChange={(ev) => setField(p.id, 'price', ev.target.value)} style={{ width: 86 }} /></td>
                  <td><input className="field sm" type="number" value={e.inventory ?? p.inventory} onChange={(ev) => setField(p.id, 'inventory', ev.target.value)} style={{ width: 72 }} /></td>
                  <td className="admin-actions">
                    <button className="ghost sm" onClick={() => save(p.id)} disabled={!edit[p.id]}>Save</button>
                    <button className="danger sm" onClick={() => remove(p.id, p.name)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
