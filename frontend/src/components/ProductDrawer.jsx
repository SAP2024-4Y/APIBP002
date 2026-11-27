import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import ErrorNote from './ErrorNote.jsx';
import { stockState } from './ProductCard.jsx';
import { categoryStyle, productIcon, statusLabel } from '../lib/catalog.js';
import { cityOf, fmtDay, fmtTime, money, relDay, TIME_ZONE, utcOffsetLabel } from '../lib/format.js';
import { useEscape } from '../lib/hooks.js';

export function Stepper({ value, max, onChange, disabled }) {
  return (
    <div className="stepper" role="group" aria-label="Quantity">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={disabled || value <= 1} aria-label="Fewer units">
        <Icon name="minus" size={13} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="More units">
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}

function SlotFailure({ failure, onBook, onOrders, onSignIn }) {
  const { error } = failure;
  const alternatives = (error.details && error.details.alternatives) || [];
  return (
    <ErrorNote error={error} compact>
      {error.code === 'SLOT_FULL' && alternatives.length > 0 && (
        <div className="alt-list">
          {alternatives.map((alt) => (
            <button key={alt.slot_id} type="button" className="btn soft sm" onClick={() => onBook(alt.slot_id, 1)}>
              Book {fmtDay(alt.starts_at)} {fmtTime(alt.starts_at)} instead · {alt.available} left
            </button>
          ))}
        </div>
      )}
      {error.code === 'BOOKING_OVERLAP' && (
        <div className="alt-list">
          <span className="muted small">
            Clashing order <code>{error.details && error.details.conflicting_booking_id}</code>
          </span>
          <button type="button" className="btn soft sm" onClick={onOrders}>
            Open My orders <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
      {error.code === 'UNAUTHENTICATED' && (
        <button type="button" className="btn soft sm" onClick={onSignIn}>
          Sign in again
        </button>
      )}
    </ErrorNote>
  );
}

export default function ProductDrawer({ product, session, onClose, requireLogin, toast, onShowOnMap, go }) {
  const [detail, setDetail] = useState(product);
  const [slots, setSlots] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState(null);
  const [booked, setBooked] = useState({});
  const [attempt, setAttempt] = useState(0);

  useEscape(onClose);

  const reloadSlots = useCallback(async () => {
    const res = await api.productSlots(product.id);
    setSlots(res.data);
  }, [product.id]);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    Promise.all([api.getProduct(product.id), api.productSlots(product.id)])
      .then(([p, s]) => {
        if (!alive) return;
        setDetail(p);
        setSlots(s.data);
      })
      .catch((e) => alive && setLoadError(e));
    return () => {
      alive = false;
    };
  }, [product.id, attempt]);

  const book = async (slotId, quantity) => {
    if (!session) {
      requireLogin();
      return;
    }
    setBusy(slotId);
    setFailure(null);
    try {
      const res = await api.book(session.token, slotId, quantity);
      setBooked((b) => ({ ...b, [slotId]: res.created.id }));
      toast({ kind: 'ok', title: 'Delivery booked', body: `Order ${res.created.id} · ${quantity} unit${quantity > 1 ? 's' : ''}` });
      await reloadSlots();
    } catch (e) {
      setFailure({ slotId, error: e });
    } finally {
      setBusy('');
    }
  };

  const p = detail;
  const { hue } = categoryStyle(p.category);
  const stock = stockState(p);
  const [lon, lat] = p.location ? p.location.coordinates : [null, null];
  const now = Date.now();

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={p.name}>
        <header className="drawer-hero" style={{ '--hue': hue }}>
          <button type="button" className="icon-btn drawer-x" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
          <div className="drawer-emoji" aria-hidden="true">
            {productIcon(p)}
          </div>
          <div className="drawer-kicker">
            <span>{p.category}</span>
            <span className={`status-chip ${p.status}`}>{statusLabel(p.status)}</span>
          </div>
          <h2>{p.name}</h2>
          <div className="drawer-price">
            {money(p.price_paise, p.currency)} <span>{p.currency}</span>
          </div>
          <div className="drawer-facts">
            {p.rating != null && (
              <span>
                <Icon name="star" size={14} fill /> {Number(p.rating).toFixed(1)} rating
              </span>
            )}
            <span className={`stock ${stock.tone}`}>
              <span className="stock-dot" /> {stock.label}
            </span>
            <span>
              <Icon name="truck" size={14} /> Ships from {cityOf(p.seller)}
            </span>
          </div>
        </header>

        <div className="drawer-body">
          {loadError && <ErrorNote error={loadError} onRetry={() => setAttempt((n) => n + 1)} />}
          {p.description && <p className="drawer-desc">{p.description}</p>}

          <dl className="facts">
            <dt>Product id</dt>
            <dd>
              <code>{p.id}</code>
            </dd>
            <dt>Price (minor units)</dt>
            <dd>
              <code>price_paise: {p.price_paise}</code> · ISO 4217 <code>{p.currency}</code>
            </dd>
            {lon != null && (
              <>
                <dt>Hub location</dt>
                <dd>
                  <code>
                    [{lon}, {lat}]
                  </code>{' '}
                  <span className="muted small">GeoJSON [lon, lat]</span>
                  <button type="button" className="link-btn" onClick={() => onShowOnMap(p)}>
                    View on map <Icon name="arrow" size={12} />
                  </button>
                </dd>
              </>
            )}
            <dt>Listed</dt>
            <dd>
              <code>{p.created_at}</code>
            </dd>
          </dl>

          <section className="slots">
            <div className="section-head">
              <h3>
                <Icon name="calendar" size={16} /> Delivery slots
              </h3>
              <span className="muted small">
                {TIME_ZONE} · {utcOffsetLabel()}
              </span>
            </div>
            {slots === null && !loadError && (
              <div className="slot-skeletons">
                <div className="sk-line w80 shimmer" />
                <div className="sk-line w60 shimmer" />
              </div>
            )}
            {slots && slots.length === 0 && <p className="muted">No delivery slots are scheduled for this product yet.</p>}
            {slots &&
              slots.map((s) => {
                const past = new Date(s.ends_at).getTime() < now;
                const full = s.available <= 0;
                const disabled = past || full;
                const q = Math.min(qty[s.id] || 1, Math.max(1, s.available));
                const fill = s.capacity ? Math.round((s.booked / s.capacity) * 100) : 0;
                return (
                  <div key={s.id} className={`slot-row ${disabled ? 'disabled' : ''}`}>
                    <div className="slot-main">
                      <div className="slot-when">
                        <span className="slot-day">
                          {relDay(s.starts_at)} · {fmtDay(s.starts_at)}
                        </span>
                        <span className="slot-time">
                          {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
                        </span>
                      </div>
                      <div className="slot-cap">
                        <div className="capbar" aria-hidden="true">
                          <span style={{ width: `${fill}%` }} />
                        </div>
                        <small>
                          {past ? 'Window has passed' : full ? 'Fully booked' : `${s.available} of ${s.capacity} left`}
                        </small>
                      </div>
                      <div className="slot-act">
                        {!disabled && (
                          <Stepper
                            value={q}
                            max={Math.max(1, s.available)}
                            onChange={(v) => setQty((m) => ({ ...m, [s.id]: v }))}
                            disabled={busy === s.id}
                          />
                        )}
                        <button
                          type="button"
                          className={`btn ${booked[s.id] ? 'success' : 'primary'} sm`}
                          disabled={disabled || busy === s.id}
                          onClick={() => book(s.id, q)}
                        >
                          {busy === s.id ? 'Booking…' : full ? 'Full' : past ? 'Closed' : booked[s.id] ? 'Book again' : session ? 'Book' : 'Sign in to book'}
                        </button>
                      </div>
                    </div>
                    {booked[s.id] && (
                      <div className="slot-booked">
                        <Icon name="check" size={14} /> Booked as <code>{booked[s.id]}</code>
                      </div>
                    )}
                    {failure && failure.slotId === s.id && (
                      <SlotFailure
                        failure={failure}
                        onBook={book}
                        onSignIn={requireLogin}
                        onOrders={() => {
                          onClose();
                          go('orders');
                        }}
                      />
                    )}
                  </div>
                );
              })}
          </section>

          <footer className="api-trace">
            <Icon name="code" size={14} />
            <span>
              Fed by <code>GET /api/v1/products/{p.id}</code>, <code>GET /api/v1/products/{p.id}/slots</code> and{' '}
              <code>POST /api/v1/bookings</code>
            </span>
          </footer>
        </div>
      </aside>
    </>
  );
}
