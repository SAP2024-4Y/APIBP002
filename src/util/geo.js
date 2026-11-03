'use strict';

const EARTH_RADIUS_KM = 6371.0088;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in kilometres. SQLite has no native geospatial
// functions, so proximity is computed in JS over the (small) product set.
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidLat(v) {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

function isValidLon(v) {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

// GeoJSON position convention is [longitude, latitude].
function toGeoJSONPoint(longitude, latitude) {
  return { type: 'Point', coordinates: [longitude, latitude] };
}

module.exports = { haversineKm, isValidLat, isValidLon, toGeoJSONPoint };
