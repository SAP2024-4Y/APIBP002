import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api.js';
import Icon from '../components/Icon.jsx';
import ErrorNote from '../components/ErrorNote.jsx';
import MeshMap from '../components/MeshMap.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import { CATEGORIES, SORTS, STATUSES, categoryStyle } from '../lib/catalog.js';
import { plural } from '../lib/format.js';
import { useDebounced } from '../lib/hooks.js';

const PAGE_SIZE = 12;

function Hero({ hubs, total, go }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">
          <span className="live-dot" /> Live from <code>/api/v1</code> + <code>/graphql</code>
        </span>
        <h1>
          Shop the mesh.
          <br />
          <em>Delivered on your slot.</em>
        </h1>
        <p>
          {total != null ? plural(total, 'product') : 'Products'} shipped from {plural(hubs.length, 'fulfilment hub')} across
          India. Filter the catalogue, find what ships near you, then book the delivery window that suits your day.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn primary lg" onClick={() => go('map')}>
            <Icon name="locate" size={18} /> Find products near me
          </button>
          <button type="button" className="btn ghost lg" onClick={() => go('calendar')}>
            <Icon name="calendar" size={18} /> See delivery slots
          </button>
        </div>
        <div className="hero-stats">
          <div>
            <b>{total ?? '—'}</b>
            <span>products</span>
          </div>
          <div>
            <b>{hubs.length || '—'}</b>
            <span>hubs</span>
          </div>
          <div>
            <b>{CATEGORIES.length}</b>
            <span>categories</span>
          </div>
          <div>
            <b>2</b>
            <span>APIs, 1 core</span>
          </div>
        </div>
      </div>
      <div className="hero-art" aria-hidden={hubs.length === 0}>
        {hubs.length > 0 ? <MeshMap hubs={hubs} variant="hero" aspect={1.05} label="Map of ShopMesh fulfilment hubs" /> : <div className="hero-art-empty shimmer" />}
        <div className="hero-art-caption">
          <Icon name="pin" size={13} /> Hubs plotted from <code>GET /api/v1/products/map</code>
        </div>
      </div>
    </section>
  );
}

export default function Shop({ onOpen, hubs, catalogueCount, go }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortKey, setSortKey] = useState('newest');
  const [page, setPage] = useState({ items: [], cursor: null, hasMore: false, total: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const term = useDebounced(q.trim(), 350);
  const min = useDebounced(minPrice, 450);
  const max = useDebounced(maxPrice, 450);

  const params = useMemo(() => {
    const s = SORTS.find((x) => x.key === sortKey);
    return { q: term, category, status, min_price: min, max_price: max, sort: s.sort, order: s.order, limit: PAGE_SIZE };
  }, [term, category, status, min, max, sortKey]);

  const load = useCallback(
    async (after) => {
      const mine = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await api.listProducts({ ...params, after });
        if (mine !== requestId.current) return;
        setPage((prev) => ({
          items: after ? [...prev.items, ...res.data] : res.data,
          cursor: res.next_cursor,
          hasMore: res.has_more,
          total: res.total_count,
        }));
      } catch (e) {
        if (mine === requestId.current) setError(e);
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    },
    [params]
  );

  useEffect(() => {
    load(undefined);
  }, [load]);

  const filtered = Boolean(term || category || status || min || max);
  const clear = () => {
    setQ('');
    setCategory('');
    setStatus('');
    setMinPrice('');
    setMaxPrice('');
    setSortKey('newest');
  };
  const priceConflict = min !== '' && max !== '' && Number(min) > Number(max);
  const query = `GET /api/v1/products${qs(params)}`;
  const remaining = page.total != null ? Math.max(0, page.total - page.items.length) : 0;

  return (
    <>
      <Hero hubs={hubs} total={catalogueCount} go={go} />

      <section className="container shop" id="catalogue">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="Search products, e.g. headphones, coffee, habits…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search products"
            />
            {q && (
              <button type="button" className="icon-btn sm" onClick={() => setQ('')} aria-label="Clear search">
                <Icon name="x" size={14} />
              </button>
            )}
          </label>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="price-range" role="group" aria-label="Price range in rupees">
            <span>₹</span>
            <input className="field" type="number" min="0" inputMode="decimal" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} aria-label="Minimum price" />
            <span className="dash">–</span>
            <input className="field" type="number" min="0" inputMode="decimal" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} aria-label="Maximum price" />
          </div>
          <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="chips" role="group" aria-label="Category">
          <button type="button" className={`chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>
            <Icon name="grid" size={14} /> All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${category === c ? 'on' : ''}`}
              style={{ '--hue': categoryStyle(c).hue }}
              onClick={() => setCategory(category === c ? '' : c)}
              aria-pressed={category === c}
            >
              <span aria-hidden="true">{categoryStyle(c).icon}</span> {c}
            </button>
          ))}
        </div>

        <div className="results-bar">
          <div>
            {page.total != null ? (
              <>
                Showing <b>{page.items.length}</b> of <b>{page.total}</b> {page.total === 1 ? 'product' : 'products'}
                {filtered && ' matching your filters'}
              </>
            ) : (
              'Loading catalogue…'
            )}
            {filtered && (
              <button type="button" className="link-btn" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
          <code className="query-echo" title="The exact List API request behind this grid">
            {query}
          </code>
        </div>

        {priceConflict && (
          <p className="inline-warn">
            <Icon name="alert" size={14} /> Minimum price is above the maximum, so nothing can match. Swap the two values.
          </p>
        )}
        {error && <ErrorNote error={error} onRetry={() => load(undefined)} />}

        <div className="grid">
          {page.items.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={onOpen} />
          ))}
          {loading && Array.from({ length: page.items.length ? 3 : 8 }, (_, i) => <ProductCardSkeleton key={`sk${i}`} />)}
        </div>

        {!loading && !error && page.items.length === 0 && (
          <div className="empty">
            <div className="empty-emoji">🔍</div>
            <h3>No products match</h3>
            <p>Try a broader search, another category or a wider price band.</p>
            <button type="button" className="btn ghost" onClick={clear}>
              Reset filters
            </button>
          </div>
        )}

        {page.items.length > 0 && (
          <div className="pager">
            {page.hasMore ? (
              <>
                <button type="button" className="btn ghost lg" disabled={loading} onClick={() => load(page.cursor)}>
                  {loading ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, remaining)} more`}
                </button>
                <small className="muted">
                  Keyset pagination · <code>after={String(page.cursor).slice(0, 18)}…</code>
                </small>
              </>
            ) : (
              <small className="muted">
                <Icon name="check" size={13} /> End of results · <code>has_more: false</code>
              </small>
            )}
          </div>
        )}
      </section>
    </>
  );
}
