import React, { useCallback, useEffect, useState } from 'react';
import { api, gql } from '../api.js';
import Icon from '../components/Icon.jsx';
import ErrorNote from '../components/ErrorNote.jsx';
import { productIcon } from '../lib/catalog.js';
import { cityOf, fmtDateTime, fmtTime, money, relDay } from '../lib/format.js';

const MY_BOOKINGS = `query MyBookings {
  myBookings {
    id quantity createdAt
    slot {
      id startsAt endsAt
      product { id name category priceInPaise currency status seller }
    }
  }
}`;

const toRestProduct = (p) => ({ id: p.id, name: p.name, category: p.category, price_paise: p.priceInPaise, currency: p.currency, status: p.status, seller: p.seller });

function OrderCard({ booking: b, upcoming, confirming, busy, onConfirm, onCancel, onKeep, onOpen }) {
  const p = b.slot.product;
  const start = new Date(b.slot.startsAt);
  return (
    <article className={`order ${upcoming ? '' : 'past'}`}>
      <div className="order-date">
        <span className="od-month">{start.toLocaleDateString('en-IN', { month: 'short' })}</span>
        <span className="od-day">{start.getDate()}</span>
        <span className="od-dow">{start.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
      </div>
      <div className="order-main">
        <div className="order-top">
          <span className="order-emoji" aria-hidden="true">
            {productIcon(p)}
          </span>
          <div>
            <h3>{p.name}</h3>
            <small className="muted">
              {p.category} · ships from {cityOf(p.seller)}
            </small>
          </div>
        </div>
        <div className="order-meta">
          <span>
            <Icon name="clock" size={14} /> {relDay(b.slot.startsAt)} · {fmtTime(b.slot.startsAt)}–{fmtTime(b.slot.endsAt)}
          </span>
          <span>
            <Icon name="box" size={14} /> {b.quantity} × {money(p.priceInPaise, p.currency)}
          </span>
          <span>
            <code>{b.id}</code>
          </span>
        </div>
        <small className="muted">Booked {fmtDateTime(b.createdAt)}</small>
      </div>
      <div className="order-actions">
        <button type="button" className="btn ghost sm" onClick={() => onOpen(toRestProduct(p))}>
          View product
        </button>
        {upcoming &&
          (confirming ? (
            <>
              <button type="button" className="btn danger sm" onClick={onCancel} disabled={busy}>
                {busy ? 'Cancelling…' : 'Confirm cancel'}
              </button>
              <button type="button" className="btn ghost sm" onClick={onKeep} disabled={busy}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost sm danger-text" onClick={onConfirm}>
              <Icon name="trash" size={14} /> Cancel
            </button>
          ))}
      </div>
    </article>
  );
}

export default function Orders({ session, requireLogin, toast, onOpen, go }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const data = await gql(MY_BOOKINGS, undefined, { token: session.token, label: 'My orders' });
      setRows(data.myBookings);
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, [session]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  if (!session) {
    return (
      <section className="container page">
        <div className="empty tall">
          <div className="empty-emoji">📦</div>
          <h3>Sign in to see your deliveries</h3>
          <p>
            Bookings belong to the signed-in customer. <code>GET /api/v1/bookings</code> and <code>myBookings</code> both
            answer <code>401 UNAUTHENTICATED</code> without a Bearer token.
          </p>
          <button type="button" className="btn primary" onClick={requireLogin}>
            Sign in
          </button>
        </div>
      </section>
    );
  }

  const cancel = async (b) => {
    setBusy(b.id);
    try {
      const res = await api.cancelBooking(session.token, b.id);
      toast({ kind: 'ok', title: 'Booking cancelled', body: `${b.quantity} unit(s) released back to ${res.slot_id}.` });
      setConfirming('');
      await load();
    } catch (e) {
      toast({ kind: 'err', title: e.code, body: e.hint || e.message });
    } finally {
      setBusy('');
    }
  };

  const now = Date.now();
  const list = rows || [];
  const upcoming = list.filter((b) => new Date(b.slot.endsAt).getTime() >= now).sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
  const past = list.filter((b) => new Date(b.slot.endsAt).getTime() < now).sort((a, b) => b.slot.startsAt.localeCompare(a.slot.startsAt));
  const units = upcoming.reduce((n, b) => n + b.quantity, 0);
  const value = upcoming.reduce((n, b) => n + b.quantity * b.slot.product.priceInPaise, 0);

  const card = (b, isUpcoming) => (
    <OrderCard
      key={b.id}
      booking={b}
      upcoming={isUpcoming}
      confirming={confirming === b.id}
      busy={busy === b.id}
      onConfirm={() => setConfirming(b.id)}
      onKeep={() => setConfirming('')}
      onCancel={() => cancel(b)}
      onOpen={onOpen}
    />
  );

  return (
    <section className="container page">
      <div className="page-head">
        <span className="page-icon">
          <Icon name="box" size={22} />
        </span>
        <div>
          <h1>My orders</h1>
          <p>
            Signed in as <b>{session.username}</b>. Each booking arrives with its slot and product in one GraphQL query;
            cancelling uses <code>DELETE /api/v1/bookings/:id</code> and releases the capacity immediately.
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span>Upcoming deliveries</span>
          <b>{upcoming.length}</b>
        </div>
        <div className="kpi">
          <span>Units on the way</span>
          <b>{units}</b>
        </div>
        <div className="kpi">
          <span>Order value</span>
          <b>{money(value)}</b>
        </div>
        <div className="kpi">
          <span>Past deliveries</span>
          <b>{past.length}</b>
        </div>
      </div>

      {error && <ErrorNote error={error} onRetry={load} />}
      {rows === null && !error && (
        <div className="order-skeletons">
          <div className="order skeleton shimmer" />
          <div className="order skeleton shimmer" />
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <div className="empty">
          <div className="empty-emoji">🛒</div>
          <h3>No deliveries booked yet</h3>
          <p>Pick a product and a delivery window — it will show up here.</p>
          <div className="row-gap">
            <button type="button" className="btn primary" onClick={() => go('shop')}>
              Browse products
            </button>
            <button type="button" className="btn ghost" onClick={() => go('calendar')}>
              Open delivery slots
            </button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="section-title">Upcoming</h2>
          <div className="orders">{upcoming.map((b) => card(b, true))}</div>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2 className="section-title">Past</h2>
          <div className="orders">{past.map((b) => card(b, false))}</div>
        </>
      )}
    </section>
  );
}
