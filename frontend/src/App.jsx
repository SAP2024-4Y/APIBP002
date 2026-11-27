import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import Icon from './components/Icon.jsx';
import Inspector from './components/Inspector.jsx';
import LoginModal from './components/LoginModal.jsx';
import ProductDrawer from './components/ProductDrawer.jsx';
import { cityOf } from './lib/format.js';
import { buildHubs, latOf, lonOf } from './lib/geo.js';
import { useApiLog, useHashRoute } from './lib/hooks.js';
import Shop from './views/Shop.jsx';
import MapView from './views/MapView.jsx';
import CalendarView from './views/CalendarView.jsx';
import Orders from './views/Orders.jsx';
import Admin from './views/Admin.jsx';
import Lab from './views/Lab.jsx';

const NAV = [
  { key: 'shop', label: 'Shop', icon: 'bag' },
  { key: 'map', label: 'Near me', icon: 'pin' },
  { key: 'calendar', label: 'Delivery slots', icon: 'calendar' },
  { key: 'orders', label: 'My orders', icon: 'box' },
  { key: 'admin', label: 'Admin', icon: 'shield' },
  { key: 'lab', label: 'API Lab', icon: 'flask' },
];
const ROUTES = new Set(NAV.map((n) => n.key));
const WORLD = { min_lat: -90, min_lon: -180, max_lat: 90, max_lon: 180 };

function initialTheme() {
  const saved = window.localStorage.getItem('shopmesh-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path className="bm-lines" d="M16 7L7 23h18L16 7zM16 7v9M7 23l9-7 9 7" />
      <circle cx="16" cy="7" r="3.2" />
      <circle cx="7" cy="23" r="3.2" />
      <circle cx="25" cy="23" r="3.2" />
      <circle className="bm-core" cx="16" cy="16" r="2.6" />
    </svg>
  );
}

function Toasts({ items, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'alert' : 'bolt'} size={16} />
          <div>
            <b>{t.title}</b>
            {t.body && <p>{t.body}</p>}
          </div>
          <button type="button" className="icon-btn sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ProjectBanner({ onDismiss }) {
  return (
    <div className="project-banner">
      <div className="project-banner-inner">
        <div className="project-banner-left">
          <span className="project-banner-tag">APIBP002 · Team Project</span>
          <h2 className="project-banner-title">What is ShopMesh?</h2>
          <p className="project-banner-desc">
            ShopMesh is the <strong>API backend for an Indian e-commerce marketplace</strong> — think the engine behind Flipkart or Amazon, not the full consumer app.
            It solves three problems every shopping platform faces:
          </p>
          <div className="project-banner-pillars">
            <div className="pbp">
              <span className="pbp-icon">🔍</span>
              <div>
                <b>Discover</b>
                <span>Filter &amp; search 555 products by category, price, status across India</span>
              </div>
            </div>
            <div className="pbp">
              <span className="pbp-icon">📍</span>
              <div>
                <b>Locate</b>
                <span>Find products whose fulfilment hub is physically close to you (geospatial search)</span>
              </div>
            </div>
            <div className="pbp">
              <span className="pbp-icon">📅</span>
              <div>
                <b>Schedule</b>
                <span>Book a conflict-free delivery slot — no double-booking, enforced by the API</span>
              </div>
            </div>
          </div>
          <p className="project-banner-tech">
            Built with <strong>Node.js · Express · Apollo GraphQL · SQLite · React</strong>.
            Exposes the same business logic over both a <strong>REST API</strong> (<code>/api/v1/*</code>) and a <strong>GraphQL API</strong> (<code>/graphql</code>),
            backed by one shared service layer. Includes JWT auth, rate limiting, live Swagger docs, and this React storefront.
          </p>
          <div className="project-banner-team">
            <span>Team:</span>
            <b>Aadarsh Verma</b>
            <b>Divyansh Jha</b>
            <b>Parimita Sarkar</b>
            <b>Simarpreet Singh</b>
          </div>
        </div>
        <div className="project-banner-links">
          <a href="/docs" target="_blank" rel="noopener noreferrer" className="pbl">
            <Icon name="flask" size={16} /> Swagger / REST docs
          </a>
          <a href="/graphql" target="_blank" rel="noopener noreferrer" className="pbl">
            <Icon name="bolt" size={16} /> GraphQL IDE
          </a>
          <a href="/openapi.yaml" target="_blank" rel="noopener noreferrer" className="pbl">
            <Icon name="box" size={16} /> OpenAPI spec
          </a>
          <a href="https://github.com/SAP2024-4Y/APIBP002" target="_blank" rel="noopener noreferrer" className="pbl">
            <Icon name="pin" size={16} /> GitHub repo
          </a>
        </div>
      </div>
      <button type="button" className="project-banner-dismiss" onClick={onDismiss} aria-label="Dismiss intro">
        Got it <Icon name="x" size={13} />
      </button>
    </div>
  );
}

export default function App() {
  const [route, go] = useHashRoute('shop');
  const page = ROUTES.has(route) ? route : 'shop';
  const [session, setSession] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(initialTheme);
  const [catalogue, setCatalogue] = useState([]);
  const [ready, setReady] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  const [bannerVisible, setBannerVisible] = useState(() => !window.sessionStorage.getItem('shopmesh-banner-dismissed'));
  const log = useApiLog();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('shopmesh-theme', theme);
  }, [theme]);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((all) => [...all.slice(-3), { id, kind: 'info', ...t }]);
      setTimeout(() => dismiss(id), t.kind === 'err' ? 7000 : 4200);
    },
    [dismiss]
  );

  const loadCatalogue = useCallback(async () => {
    try {
      const res = await api.mapBox(WORLD, 'Map API · hub mesh');
      setCatalogue(res.data);
    } catch (e) {
      toast({ kind: 'err', title: e.code, body: e.hint || e.message });
    }
  }, [toast]);

  useEffect(() => {
    loadCatalogue();
    api
      .ready()
      .then(setReady)
      .catch(() => setReady({ status: 'down' }));
  }, [loadCatalogue]);

  const hubs = useMemo(() => buildHubs(catalogue), [catalogue]);
  const requireLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

  const onSignedIn = (s) => {
    setSession(s);
    setLoginOpen(false);
    toast({ kind: 'ok', title: `Signed in as ${s.username}`, body: `Role: ${s.role} · JWT expires in ${s.expiresIn}` });
  };
  const signOut = () => {
    setSession(null);
    toast({ kind: 'info', title: 'Signed out', body: 'The token was dropped from memory.' });
  };
  const showOnMap = (p) => {
    setDrawer(null);
    setMapFocus({ lat: latOf(p), lon: lonOf(p), label: cityOf(p.seller), key: `${p.id}-${Date.now()}` });
    go('map');
  };

  const budget = log.budget;
  const pct = budget ? Math.round((budget.remaining / budget.limit) * 100) : 100;

  return (
    <div className={`app ${inspectorOpen ? 'with-inspector' : ''}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="#/shop" aria-label="ShopMesh home">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span className="brand-name">ShopMesh</span>
          <span className="brand-id">APIBP002</span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={page === n.key ? 'on' : ''} aria-current={page === n.key ? 'page' : undefined}>
              <Icon name={n.icon} size={16} />
              <span>{n.label}</span>
              {n.key === 'admin' && (!session || session.role !== 'admin') && <Icon name="key" size={11} className="lock" />}
            </a>
          ))}
        </nav>
        <div className="top-actions">
          <button
            type="button"
            className={`api-pill ${pct < 20 ? 'low' : ''} ${inspectorOpen ? 'on' : ''}`}
            onClick={() => setInspectorOpen((o) => !o)}
            aria-pressed={inspectorOpen}
            title="Every API request this page made, with the live rate-limit budget"
          >
            <Icon name="pulse" size={15} />
            <span>
              API log <b>{log.calls.length}</b>
            </span>
            <span className="api-pill-meter" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {session ? (
            <div className="user-chip">
              <span className="avatar">{session.username.slice(0, 1).toUpperCase()}</span>
              <span className="user-meta">
                <b>{session.username}</b>
                <small className={`role-badge ${session.role}`}>{session.role}</small>
              </span>
              <button type="button" className="icon-btn sm" onClick={signOut} aria-label="Sign out">
                <Icon name="logout" size={15} />
              </button>
            </div>
          ) : (
            <button type="button" className="btn primary sm" onClick={requireLogin}>
              <Icon name="user" size={15} /> Sign in
            </button>
          )}
        </div>
      </header>

      <main id="main">
        {bannerVisible && page === 'shop' && (
          <ProjectBanner onDismiss={() => { window.sessionStorage.setItem('shopmesh-banner-dismissed', '1'); setBannerVisible(false); }} />
        )}
        {page === 'shop' && <Shop onOpen={setDrawer} hubs={hubs} catalogueCount={catalogue.length || null} go={go} />}
        {page === 'map' && <MapView key={mapFocus ? mapFocus.key : 'default'} hubs={hubs} onOpen={setDrawer} focus={mapFocus} toast={toast} />}
        {page === 'calendar' && <CalendarView session={session} requireLogin={requireLogin} toast={toast} onOpen={setDrawer} />}
        {page === 'orders' && <Orders session={session} requireLogin={requireLogin} toast={toast} onOpen={setDrawer} go={go} />}
        {page === 'admin' && (
          <Admin session={session} requireLogin={requireLogin} toast={toast} hubs={hubs} onCatalogueChange={loadCatalogue} />
        )}
        {page === 'lab' && <Lab products={catalogue} />}
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <div className="footer-brand">
              ShopMesh <span className="brand-id">APIBP002</span>
            </div>
            <p className="muted">
              Approach A — REST-first with a GraphQL layer. Both APIs call one service core, so behaviour and the 14-code
              error catalogue stay in parity.
            </p>
            <p className={`health ${ready ? ready.status : ''}`}>
              <span className="live-dot" />
              {ready
                ? ready.status === 'ready'
                  ? `Ready · ${ready.products} products · ${ready.slots} slots`
                  : 'API not ready'
                : 'Checking readiness…'}{' '}
              <code>GET /ready</code>
            </p>
          </div>
          <nav className="footer-links" aria-label="API documentation">
            <a href="/docs" target="_blank" rel="noreferrer">
              REST docs (Swagger) <Icon name="external" size={12} />
            </a>
            <a href="/openapi.yaml" target="_blank" rel="noreferrer">
              OpenAPI YAML <Icon name="external" size={12} />
            </a>
            <a href="/graphql" target="_blank" rel="noreferrer">
              GraphQL IDE <Icon name="external" size={12} />
            </a>
            <a href="/health" target="_blank" rel="noreferrer">
              Liveness probe <Icon name="external" size={12} />
            </a>
          </nav>
          <div className="team">
            <b>Team APIBP002</b>
            <span>Aadarsh Verma</span>
            <span>Divyansh Jha</span>
            <span>Parimita Sarkar</span>
            <span>Simarpreet Singh</span>
          </div>
        </div>
      </footer>

      {drawer && (
        <ProductDrawer
          key={drawer.id}
          product={drawer}
          session={session}
          onClose={closeDrawer}
          requireLogin={requireLogin}
          toast={toast}
          onShowOnMap={showOnMap}
          go={go}
        />
      )}
      {loginOpen && <LoginModal onClose={closeLogin} onSignedIn={onSignedIn} />}
      {inspectorOpen && <Inspector log={log} onClose={closeInspector} />}
      <Toasts items={toasts} dismiss={dismiss} />
    </div>
  );
}
