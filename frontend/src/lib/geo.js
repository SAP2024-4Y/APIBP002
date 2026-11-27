import { cityOf } from './format.js';

export const KM_PER_DEG = 111.32;

// GeoJSON positions are [longitude, latitude].
export const lonOf = (p) => p.location.coordinates[0];
export const latOf = (p) => p.location.coordinates[1];

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const hubKey = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

// Groups products into fulfilment hubs by their (shared) coordinates.
export function buildHubs(products) {
  const hubs = new Map();
  products.forEach((p) => {
    const lat = latOf(p);
    const lon = lonOf(p);
    const key = hubKey(lat, lon);
    if (!hubs.has(key)) hubs.set(key, { key, lat, lon, city: cityOf(p.seller), seller: p.seller, products: [] });
    hubs.get(key).products.push(p);
  });
  return [...hubs.values()]
    .map((h) => ({ ...h, count: h.products.length }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
