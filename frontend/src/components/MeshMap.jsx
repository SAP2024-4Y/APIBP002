import React, { useId, useMemo } from 'react';
import { KM_PER_DEG, haversineKm } from '../lib/geo.js';

const W = 600;
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function grow(lo, hi, span) {
  const extra = (span - (hi - lo)) / 2;
  return extra > 0 ? [lo - extra, hi + extra] : [lo, hi];
}

// Equirectangular viewport that contains every point and matches the aspect ratio.
function fitBounds(points, aspect, pad, minSpan) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  points.forEach(([lon, lat]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  });
  if (!Number.isFinite(minLat)) [minLat, maxLat, minLon, maxLon] = [8, 32, 70, 92];
  [minLat, maxLat] = grow(minLat - pad, maxLat + pad, minSpan);
  [minLon, maxLon] = grow(minLon - pad, maxLon + pad, minSpan);
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const pw = (maxLon - minLon) * cos;
  const ph = maxLat - minLat;
  if (pw / ph < aspect) [minLon, maxLon] = grow(minLon, maxLon, (aspect * ph) / cos);
  else [minLat, maxLat] = grow(minLat, maxLat, pw / aspect);
  return { minLat, maxLat, minLon, maxLon, cos };
}

function placeLabels(nodes) {
  const placed = [];
  const bodies = nodes.map((n) => ({ x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 }));
  return nodes.map((n) => {
    const w = n.city.length * 6.6 + 6;
    const h = 14;
    const options = [
      { x: n.x - w / 2, y: n.y - n.r - 6 - h, tx: n.x, ty: n.y - n.r - 9, anchor: 'middle' },
      { x: n.x + n.r + 4, y: n.y - h / 2, tx: n.x + n.r + 6, ty: n.y + 4, anchor: 'start' },
      { x: n.x - n.r - 4 - w, y: n.y - h / 2, tx: n.x - n.r - 6, ty: n.y + 4, anchor: 'end' },
      { x: n.x - w / 2, y: n.y + n.r + 4, tx: n.x, ty: n.y + n.r + 15, anchor: 'middle' },
    ];
    const blocked = (o) => {
      const rect = { x: o.x, y: o.y, w, h };
      return rect.x < 0 || rect.x + w > W || placed.some((p) => overlaps(p, rect)) || bodies.some((b) => overlaps(b, rect));
    };
    const choice = options.find((o) => !blocked(o)) || options[0];
    placed.push({ x: choice.x, y: choice.y, w, h });
    return { ...n, label: choice };
  });
}

export default function MeshMap({
  hubs,
  variant = 'panel',
  aspect = 1.2,
  highlight,
  center,
  radiusKm,
  box,
  selectedKey,
  onHubClick,
  label = 'Fulfilment hub mesh',
}) {
  const clipId = useId().replace(/:/g, '');
  const model = useMemo(() => {
    const points = hubs.map((h) => [h.lon, h.lat]);
    if (center) points.push([center.lon, center.lat]);
    if (box) points.push([box.min_lon, box.min_lat], [box.max_lon, box.max_lat]);
    const b = fitBounds(points, aspect, variant === 'hero' ? 1.4 : 2.2, 9);
    const k = W / ((b.maxLon - b.minLon) * b.cos);
    const H = W / aspect;
    const project = (lon, lat) => [(lon - b.minLon) * b.cos * k, (b.maxLat - lat) * k];

    const nodes = hubs.map((h) => {
      const [x, y] = project(h.lon, h.lat);
      return { ...h, x, y, r: 5 + Math.sqrt(h.count) * 2.3 };
    });

    const edgeKeys = new Set();
    const edges = [];
    nodes.forEach((a) => {
      nodes
        .filter((b2) => b2 !== a)
        .map((b2) => ({ b2, d: haversineKm(a.lat, a.lon, b2.lat, b2.lon) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 2)
        .forEach(({ b2 }) => {
          const key = [a.key, b2.key].sort().join('|');
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            edges.push({ key, a, b: b2 });
          }
        });
    });

    const step = b.maxLat - b.minLat > 14 ? 5 : 2;
    const lats = [];
    for (let v = Math.ceil(b.minLat / step) * step; v <= b.maxLat; v += step) lats.push(v);
    const lons = [];
    for (let v = Math.ceil(b.minLon / step) * step; v <= b.maxLon; v += step) lons.push(v);

    let circle = null;
    if (center && radiusKm) {
      const [cx, cy] = project(center.lon, center.lat);
      const ry = (radiusKm / KM_PER_DEG) * k;
      const rx = ry * (b.cos / Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
      circle = { cx, cy, rx, ry };
    }
    let rect = null;
    if (box) {
      const [x1, y1] = project(box.min_lon, box.max_lat);
      const [x2, y2] = project(box.max_lon, box.min_lat);
      rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    const pin = center ? project(center.lon, center.lat) : null;
    return { H, nodes: placeLabels(nodes), edges, lats, lons, project, circle, rect, pin };
  }, [hubs, center, radiusKm, box, aspect, variant]);

  const { H, nodes, edges, lats, lons, project, circle, rect, pin } = model;
  const stateOf = (key) => {
    if (selectedKey === key) return 'selected';
    if (!highlight) return '';
    return highlight.has(key) ? 'on' : 'dim';
  };

  return (
    <svg className={`mesh mesh-${variant}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect width={W} height={H} rx="18" />
        </clipPath>
        <radialGradient id={`${clipId}-glow`}>
          <stop offset="0%" style={{ stopColor: 'var(--brand)', stopOpacity: 0.45 }} />
          <stop offset="100%" style={{ stopColor: 'var(--brand)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect className="mesh-bg" width={W} height={H} />
        <g className="mesh-grid">
          {lats.map((v) => {
            const y = project(0, v)[1];
            return (
              <g key={`lat${v}`}>
                <line x1="0" x2={W} y1={y} y2={y} />
                {variant !== 'hero' && (
                  <text x="8" y={y - 4}>
                    {Math.abs(v)}°{v >= 0 ? 'N' : 'S'}
                  </text>
                )}
              </g>
            );
          })}
          {lons.map((v) => {
            const x = project(v, 0)[0];
            return (
              <g key={`lon${v}`}>
                <line y1="0" y2={H} x1={x} x2={x} />
                {variant !== 'hero' && (
                  <text x={x + 4} y={H - 8}>
                    {Math.abs(v)}°{v >= 0 ? 'E' : 'W'}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        {rect && <rect className="mesh-box" x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="10" />}
        {circle && <ellipse className="mesh-radius" cx={circle.cx} cy={circle.cy} rx={circle.rx} ry={circle.ry} />}
        <g className="mesh-edges">
          {edges.map((e, i) => (
            <line
              key={e.key}
              className={`mesh-edge ${variant === 'hero' && i % 2 === 0 ? 'flow' : ''} ${
                highlight && highlight.has(e.a.key) && highlight.has(e.b.key) ? 'on' : ''
              }`}
              style={{ animationDelay: `${(i % 5) * 0.6}s` }}
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
            />
          ))}
        </g>
        <g className="mesh-hubs">
          {nodes.map((n) => {
            const interactive = Boolean(onHubClick);
            return (
              <g
                key={n.key}
                className={`hub ${stateOf(n.key)} ${interactive ? 'interactive' : ''}`}
                onClick={interactive ? () => onHubClick(n) : undefined}
                onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onHubClick(n) : undefined}
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? 'button' : undefined}
                aria-label={interactive ? `${n.city}: ${n.count} products` : undefined}
              >
                <circle className="hub-glow" cx={n.x} cy={n.y} r={n.r * 2.6} fill={`url(#${clipId}-glow)`} />
                <circle className="hub-dot" cx={n.x} cy={n.y} r={n.r} />
                {variant !== 'hero' && (
                  <text className="hub-count" x={n.x} y={n.y + 3.5} textAnchor="middle">
                    {n.count}
                  </text>
                )}
                <text className="hub-label" x={n.label.tx} y={n.label.ty} textAnchor={n.label.anchor}>
                  {n.city}
                </text>
              </g>
            );
          })}
        </g>
        {pin && (
          <g className="mesh-pin" transform={`translate(${pin[0]} ${pin[1]})`}>
            <circle r="13" className="pin-ring" />
            <circle r="5.5" className="pin-dot" />
          </g>
        )}
      </g>
    </svg>
  );
}
