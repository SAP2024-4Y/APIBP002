import React from 'react';
import Icon from './Icon.jsx';
import { categoryStyle, productIcon, statusLabel } from '../lib/catalog.js';
import { cityOf, fmtKm, money } from '../lib/format.js';

export function stockState(p) {
  if (p.inventory == null) return { tone: 'ok', label: 'Checking stock…' };
  if (p.inventory === 0) return { tone: 'none', label: 'No stock' };
  if (p.inventory < 30) return { tone: 'low', label: `Only ${p.inventory} left` };
  return { tone: 'ok', label: `${p.inventory} in stock` };
}

export default function ProductCard({ product: p, onOpen, distanceKm }) {
  const { hue } = categoryStyle(p.category);
  const stock = stockState(p);
  return (
    <button type="button" className="pcard" style={{ '--hue': hue }} onClick={() => onOpen(p)}>
      <div className="pcard-art">
        <span className="pcard-emoji" aria-hidden="true">
          {productIcon(p)}
        </span>
        {p.status !== 'active' && <span className={`ribbon ${p.status}`}>{statusLabel(p.status)}</span>}
        {distanceKm != null && (
          <span className="pcard-dist">
            <Icon name="pin" size={12} /> {fmtKm(distanceKm)}
          </span>
        )}
      </div>
      <div className="pcard-body">
        <div className="pcard-meta">
          {p.category} · {cityOf(p.seller)}
        </div>
        <h3 className="pcard-title">{p.name}</h3>
        <div className="pcard-foot">
          <span className="price">{money(p.price_paise, p.currency)}</span>
          {p.rating != null && (
            <span className="rating">
              <Icon name="star" size={13} fill /> {Number(p.rating).toFixed(1)}
            </span>
          )}
        </div>
        <div className={`stock ${stock.tone}`}>
          <span className="stock-dot" /> {stock.label}
        </div>
      </div>
    </button>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="pcard skeleton" aria-hidden="true">
      <div className="pcard-art shimmer" />
      <div className="pcard-body">
        <div className="sk-line w40 shimmer" />
        <div className="sk-line w80 shimmer" />
        <div className="sk-line w60 shimmer" />
      </div>
    </div>
  );
}
