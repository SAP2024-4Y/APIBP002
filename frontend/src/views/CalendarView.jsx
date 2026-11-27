import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { gql } from '../api.js';
import Icon from '../components/Icon.jsx';
import ErrorNote from '../components/ErrorNote.jsx';
import { productIcon } from '../lib/catalog.js';
import { addDays, cityOf, dayKey, fmtDay, fmtTime, fromDayKey, money, relDay, startOfDay, TIME_ZONE, utcOffsetLabel } from '../lib/format.js';

const SPANS = [1, 3, 7, 14];

const CALENDAR_QUERY = `query CalendarWindow($from: DateTime!, $to: DateTime!) {
  slots(startsAt: $from, endsAt: $to) {
    id startsAt endsAt capacity booked available
    product { id name category priceInPaise currency status seller }
  }
}`;

const NEXT_SLOT_QUERY = `query NextOpenSlot($from: DateTime!) {
  slots(startsAt: $from) { startsAt available }
}`;

const BOOK_MUTATION = `mutation BookSlot($slotId: ID!, $quantity: Int!) {
  bookSlot(slotId: $slotId, quantity: $quantity) { id slotId quantity createdAt }
}`;

function heat(available, capacity) {
  if (!capacity || available <= 0) return 'full';
  const ratio = available / capacity;
  if (ratio < 0.25) return 'low';
  if (ratio < 0.6) return 'mid';
  return 'high';
}

const toRestProduct = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price_paise: p.priceInPaise,
  currency: p.currency,
  status: p.status,
  seller: p.seller,
});

export default function CalendarView({ session, requireLogin, toast, onOpen }) {
  const [start, setStart] = useState(() => startOfDay(new Date()));
  const [span, setSpan] = useState(7);
  const [slots, setSlots] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState('');
  const [bookError, setBookError] = useState(null);

  const from = start.toISOString();
  const to = addDays(start, span).toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gql(CALENDAR_QUERY, { from, to }, { label: 'Calendar · slots in window' });
      setSlots(data.slots);
    } catch (e) {
      setError(e);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    const list = Array.from({ length: span }, (_, i) => {
      const date = addDays(start, i);
      return { key: dayKey(date), date, windows: new Map() };
    });
    const byKey = new Map(list.map((d) => [d.key, d]));
    (slots || []).forEach((s) => {
      const day = byKey.get(dayKey(s.startsAt)) || list[0];
      const wKey = `${s.startsAt}|${s.endsAt}`;
      if (!day.windows.has(wKey)) {
        day.windows.set(wKey, { key: wKey, startsAt: s.startsAt, endsAt: s.endsAt, slots: [], capacity: 0, available: 0 });
      }
      const w = day.windows.get(wKey);
      w.slots.push(s);
      w.capacity += s.capacity;
      w.available += Math.max(0, s.available);
    });
    return list.map((d) => ({ ...d, windows: [...d.windows.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
  }, [slots, start, span]);

  const windows = days.flatMap((d) => d.windows);
  const active = windows.find((w) => w.key === selected) || null;
  const freeUnits = windows.reduce((n, w) => n + w.available, 0);

  const shift = (n) => {
    setSelected(null);
    setStart((s) => addDays(s, n));
  };

  const jumpToNext = async () => {
    try {
      const data = await gql(NEXT_SLOT_QUERY, { from: new Date().toISOString() }, { label: 'Calendar · next open slot' });
      const next = data.slots.find((s) => s.available > 0) || data.slots[0];
      if (!next) {
        toast({ kind: 'info', title: 'No upcoming slots', body: 'Every scheduled delivery window is in the past.' });
        return;
      }
      setSelected(null);
      setStart(startOfDay(next.startsAt));
    } catch (e) {
      toast({ kind: 'err', title: e.code, body: e.hint || e.message });
    }
  };

  const book = async (slot) => {
    if (!session) {
      requireLogin();
      return;
    }
    setBusy(slot.id);
    setBookError(null);
    try {
      const data = await gql(BOOK_MUTATION, { slotId: slot.id, quantity: 1 }, { token: session.token, label: 'Calendar · bookSlot' });
      toast({ kind: 'ok', title: 'Delivery booked', body: `${slot.product.name} · order ${data.bookSlot.id}` });
      await load();
    } catch (e) {
      setBookError({ slotId: slot.id, error: e });
    } finally {
      setBusy('');
    }
  };

  const cols = Math.min(span, 7);

  return (
    <section className="container page">
      <div className="page-head">
        <span className="page-icon">
          <Icon name="calendar" size={22} />
        </span>
        <div>
          <h1>Delivery slots</h1>
          <p>
            Every delivery window that overlaps the dates you pick, fetched in one GraphQL round-trip (slot + product
            through DataLoader). Pick a window to see who still has space and book it.
          </p>
        </div>
      </div>

      <div className="cal-toolbar card pad">
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => shift(-span)} aria-label="Earlier">
            <Icon name="arrow" size={16} className="flip" />
          </button>
          <button type="button" className="btn ghost sm" onClick={() => { setSelected(null); setStart(startOfDay(new Date())); }}>
            Today
          </button>
          <button type="button" className="icon-btn" onClick={() => shift(span)} aria-label="Later">
            <Icon name="arrow" size={16} />
          </button>
          <input
            className="field"
            type="date"
            value={dayKey(start)}
            onChange={(e) => e.target.value && (setSelected(null), setStart(fromDayKey(e.target.value)))}
            aria-label="Start date"
          />
        </div>
        <div className="seg compact" role="group" aria-label="Days to show">
          {SPANS.map((n) => (
            <button key={n} type="button" className={span === n ? 'on' : ''} onClick={() => { setSelected(null); setSpan(n); }}>
              {n === 1 ? '1 day' : `${n} days`}
            </button>
          ))}
        </div>
        <div className="cal-summary">
          <span>
            <b>{windows.length}</b> windows
          </span>
          <span>
            <b>{freeUnits}</b> free units
          </span>
          <span className="muted small">
            {TIME_ZONE} ({utcOffsetLabel()}) · API is ISO 8601 UTC
          </span>
        </div>
      </div>

      <code className="query-echo block">
        POST /graphql · slots(startsAt: &quot;{from}&quot;, endsAt: &quot;{to}&quot;)
      </code>

      {error && <ErrorNote error={error} onRetry={load} />}

      <div className={`cal-grid ${loading ? 'is-loading' : ''}`} style={{ '--cols': cols }}>
        {days.map((d) => (
          <div key={d.key} className="cal-day">
            <div className="cal-day-head">
              <span className="cal-dow">{d.date.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              <span className="cal-date">{d.date.getDate()}</span>
              <span className="cal-rel">{relDay(d.date)}</span>
            </div>
            {d.windows.length === 0 && <div className="cal-none">No slots</div>}
            {d.windows.map((w) => (
              <button
                key={w.key}
                type="button"
                className={`win ${heat(w.available, w.capacity)} ${selected === w.key ? 'on' : ''}`}
                onClick={() => {
                  setBookError(null);
                  setSelected(selected === w.key ? null : w.key);
                }}
              >
                <span className="win-time">
                  <Icon name="clock" size={13} /> {fmtTime(w.startsAt)}–{fmtTime(w.endsAt)}
                </span>
                <span className="win-bar">
                  <i style={{ width: `${w.capacity ? Math.round(((w.capacity - w.available) / w.capacity) * 100) : 100}%` }} />
                </span>
                <span className="win-meta">
                  {w.available} free · {w.slots.length} products
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {!loading && !error && windows.length === 0 && (
        <div className="empty">
          <div className="empty-emoji">🗓️</div>
          <h3>No delivery windows in these dates</h3>
          <p>Slots are scheduled a few days ahead. Jump to the next window that still has space.</p>
          <button type="button" className="btn primary" onClick={jumpToNext}>
            Jump to next open slot
          </button>
        </div>
      )}

      <div className="cal-legend">
        <span>
          <i className="win-swatch high" /> plenty of space
        </span>
        <span>
          <i className="win-swatch mid" /> filling up
        </span>
        <span>
          <i className="win-swatch low" /> almost full
        </span>
        <span>
          <i className="win-swatch full" /> full
        </span>
      </div>

      {active && (
        <div className="card window-detail">
          <div className="window-head">
            <div>
              <h2>
                {fmtDay(active.startsAt)} · {fmtTime(active.startsAt)}–{fmtTime(active.endsAt)}
              </h2>
              <p className="muted">
                {active.available} of {active.capacity} units free across {active.slots.length} products ·{' '}
                <code>
                  {active.startsAt} → {active.endsAt}
                </code>
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label="Close window details">
              <Icon name="x" />
            </button>
          </div>
          <ul className="window-list">
            {[...active.slots]
              .sort((a, b) => b.available - a.available || a.product.name.localeCompare(b.product.name))
              .map((s) => (
                <li key={s.id}>
                  <button type="button" className="hit" onClick={() => onOpen(toRestProduct(s.product))}>
                    <span className="hit-emoji" aria-hidden="true">
                      {productIcon(s.product)}
                    </span>
                    <span className="hit-main">
                      <b>{s.product.name}</b>
                      <small>
                        {s.product.category} · {cityOf(s.product.seller)} · {money(s.product.priceInPaise, s.product.currency)}
                      </small>
                    </span>
                  </button>
                  <span className={`avail-pill ${heat(s.available, s.capacity)}`}>
                    {s.available}/{s.capacity}
                  </span>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={s.available <= 0 || busy === s.id}
                    onClick={() => book(s)}
                  >
                    {busy === s.id ? 'Booking…' : s.available <= 0 ? 'Full' : session ? 'Book 1' : 'Sign in'}
                  </button>
                  {bookError && bookError.slotId === s.id && (
                    <div className="row-error">
                      <ErrorNote error={bookError.error} compact />
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
