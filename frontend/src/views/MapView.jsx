import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api.js';
import Icon from '../components/Icon.jsx';
import ErrorNote from '../components/ErrorNote.jsx';
import MeshMap from '../components/MeshMap.jsx';
import { productIcon } from '../lib/catalog.js';
import { cityOf, fmtKm, money } from '../lib/format.js';
import { hubKey, latOf, lonOf } from '../lib/geo.js';
import { useDebounced } from '../lib/hooks.js';

const RADII = [5, 10, 25, 50, 100, 200, 300, 500, 800, 1200, 2000];
const REGIONS = [
  { key: 'south', label: 'South India', box: { min_lat: 8, min_lon: 74, max_lat: 17, max_lon: 81 } },
  { key: 'west', label: 'West coast', box: { min_lat: 15, min_lon: 68, max_lat: 24.5, max_lon: 75 } },
  { key: 'north', label: 'North India', box: { min_lat: 24, min_lon: 73, max_lat: 32, max_lon: 81 } },
  { key: 'east', label: 'East India', box: { min_lat: 19, min_lon: 84, max_lat: 27, max_lon: 92 } },
  { key: 'all', label: 'Whole country', box: { min_lat: 6, min_lon: 68, max_lat: 37, max_lon: 98 } },
];
const DEFAULT_CENTER = { lat: 12.9716, lon: 77.5946, label: 'Bengaluru' };
const validPoint = (c) => Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180;
const validBox = (b) => Object.values(b).every(Number.isFinite);
const toDraftBox = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)]));

export default function MapView({ hubs, onOpen, focus, toast }) {
  const [mode, setMode] = useState('radius');
  const [center, setCenter] = useState(focus || DEFAULT_CENTER);
  const [draft, setDraft] = useState({ lat: String((focus || DEFAULT_CENTER).lat), lon: String((focus || DEFAULT_CENTER).lon) });
  const [radiusIdx, setRadiusIdx] = useState(focus ? 4 : 6);
  const [region, setRegion] = useState('south');
  const [box, setBox] = useState(REGIONS[0].box);
  const [draftBox, setDraftBox] = useState(toDraftBox(REGIONS[0].box));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locating, setLocating] = useState(false);
  const radiusKm = useDebounced(RADII[radiusIdx], 300);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === 'radius'
          ? await api.mapRadius({ latitude: center.lat, longitude: center.lon, radius_km: radiusKm })
          : await api.mapBox(box);
      setResult(res);
    } catch (e) {
      setError(e);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [mode, center, radiusKm, box]);

  useEffect(() => {
    search();
  }, [search]);

  const moveTo = (c) => {
    setMode('radius');
    setCenter(c);
    setDraft({ lat: String(c.lat), lon: String(c.lon) });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      toast({ kind: 'err', title: 'Location unavailable', body: 'This browser cannot share a location. Pick a hub or type coordinates.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        moveTo({ lat: Number(pos.coords.latitude.toFixed(4)), lon: Number(pos.coords.longitude.toFixed(4)), label: 'your location' });
      },
      (err) => {
        setLocating(false);
        toast({ kind: 'err', title: 'Could not read your location', body: `${err.message || 'Permission denied'}. Pick a hub or type coordinates instead.` });
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  };

  const items = result ? result.data : [];
  const highlight = useMemo(() => new Set(items.map((p) => hubKey(latOf(p), lonOf(p)))), [items]);
  const query =
    mode === 'radius'
      ? `GET /api/v1/products/map${qs({ latitude: center.lat, longitude: center.lon, radius_km: radiusKm })}`
      : `GET /api/v1/products/map${qs(box)}`;

  return (
    <section className="container page">
      <div className="page-head">
        <span className="page-icon">
          <Icon name="pin" size={22} />
        </span>
        <div>
          <h1>What ships near you</h1>
          <p>
            The Map API answers two questions: what is within <i>X km</i> of a point, and what sits inside a region. Your
            browser supplies the point — the server never guesses where you are.
          </p>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-side">
          <div className="card pad">
            <div className="seg" role="tablist" aria-label="Search mode">
              <button type="button" role="tab" aria-selected={mode === 'radius'} className={mode === 'radius' ? 'on' : ''} onClick={() => setMode('radius')}>
                <Icon name="locate" size={15} /> Radius
              </button>
              <button type="button" role="tab" aria-selected={mode === 'box'} className={mode === 'box' ? 'on' : ''} onClick={() => setMode('box')}>
                <Icon name="grid" size={15} /> Region box
              </button>
            </div>

            {mode === 'radius' ? (
              <>
                <button type="button" className="btn primary block" onClick={locate} disabled={locating}>
                  <Icon name="locate" size={16} /> {locating ? 'Locating…' : 'Use my location'}
                </button>
                <div className="field-label">Or start from a hub</div>
                <div className="pick-row">
                  {hubs.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      className={`chip sm ${center.lat === h.lat && center.lon === h.lon ? 'on' : ''}`}
                      onClick={() => moveTo({ lat: h.lat, lon: h.lon, label: h.city })}
                    >
                      {h.city}
                    </button>
                  ))}
                </div>
                <form
                  className="coord-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    moveTo({ lat: Number(draft.lat), lon: Number(draft.lon), label: 'the typed point' });
                  }}
                >
                  <label>
                    Latitude
                    <input className="field" inputMode="decimal" value={draft.lat} onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))} />
                  </label>
                  <label>
                    Longitude
                    <input className="field" inputMode="decimal" value={draft.lon} onChange={(e) => setDraft((d) => ({ ...d, lon: e.target.value }))} />
                  </label>
                  <button type="submit" className="btn ghost">
                    Go
                  </button>
                </form>
                <div className="range-head">
                  <span>Radius</span>
                  <b>{RADII[radiusIdx].toLocaleString('en-IN')} km</b>
                </div>
                <input
                  className="range"
                  type="range"
                  min="0"
                  max={RADII.length - 1}
                  value={radiusIdx}
                  onChange={(e) => setRadiusIdx(Number(e.target.value))}
                  aria-label="Search radius"
                />
              </>
            ) : (
              <>
                <div className="field-label">Regions</div>
                <div className="pick-row">
                  {REGIONS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`chip sm ${region === r.key ? 'on' : ''}`}
                      onClick={() => {
                        setRegion(r.key);
                        setBox(r.box);
                        setDraftBox(toDraftBox(r.box));
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <form
                  className="box-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setRegion('');
                    setBox(Object.fromEntries(Object.entries(draftBox).map(([k, v]) => [k, Number(v)])));
                  }}
                >
                  {[
                    ['max_lat', 'North (max_lat)'],
                    ['max_lon', 'East (max_lon)'],
                    ['min_lat', 'South (min_lat)'],
                    ['min_lon', 'West (min_lon)'],
                  ].map(([k, label]) => (
                    <label key={k}>
                      {label}
                      <input className="field" inputMode="decimal" value={draftBox[k]} onChange={(e) => setDraftBox((b) => ({ ...b, [k]: e.target.value }))} />
                    </label>
                  ))}
                  <button type="submit" className="btn ghost block">
                    Apply box
                  </button>
                </form>
              </>
            )}
            <code className="query-echo block">{query}</code>
          </div>

          <div className="card results-card">
            <div className="results-head">
              {loading ? (
                <span className="muted">Searching…</span>
              ) : (
                <span>
                  <b>{items.length}</b> {items.length === 1 ? 'product' : 'products'}{' '}
                  {mode === 'radius' ? `within ${radiusKm.toLocaleString('en-IN')} km of ${center.label}` : 'inside the box'}
                </span>
              )}
              {result && <span className={`mode-tag ${result.mode}`}>mode: {result.mode}</span>}
            </div>
            {error && <ErrorNote error={error} compact />}
            {!error && !loading && items.length === 0 && (
              <p className="muted pad-x">Nothing ships from inside this area. Widen the radius or pick another hub.</p>
            )}
            <ul className="hit-list">
              {items.map((p) => (
                <li key={p.id}>
                  <button type="button" className="hit" onClick={() => onOpen(p)}>
                    <span className="hit-emoji" aria-hidden="true">
                      {productIcon(p)}
                    </span>
                    <span className="hit-main">
                      <b>{p.name}</b>
                      <small>
                        {p.category} · {cityOf(p.seller)}
                      </small>
                    </span>
                    <span className="hit-side">
                      {p.distance_km != null && <span className="dist-pill">{fmtKm(p.distance_km)}</span>}
                      <small>{money(p.price_paise, p.currency)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card map-canvas">
          <MeshMap
            hubs={hubs}
            aspect={1.15}
            highlight={result ? highlight : undefined}
            center={mode === 'radius' && validPoint(center) ? center : undefined}
            radiusKm={mode === 'radius' ? radiusKm : undefined}
            box={mode === 'box' && validBox(box) ? box : undefined}
            onHubClick={(h) => moveTo({ lat: h.lat, lon: h.lon, label: h.city })}
            label="Fulfilment hubs with the current search area"
          />
          <div className="map-legend">
            <span>
              <i className="lg-dot on" /> hub with matches
            </span>
            <span>
              <i className="lg-dot" /> other hub
            </span>
            <span>
              <i className={`lg-area ${mode}`} /> {mode === 'radius' ? 'search radius' : 'bounding box'}
            </span>
            <span className="muted">Equirectangular projection · click a hub to search around it</span>
          </div>
        </div>
      </div>
    </section>
  );
}
