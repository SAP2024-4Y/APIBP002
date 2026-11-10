// Thin REST client for the ShopMesh API. Uses relative URLs so the same build
// works behind the Express static server (prod) and the Vite proxy (dev).

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const code = data && data.error ? data.error.code : `HTTP_${res.status}`;
    const message = data && data.error ? data.error.message : res.statusText;
    const err = new Error(message);
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function login(username, password) {
  return request('/api/v1/auth/token', { method: 'POST', body: { username, password } });
}

export function listProducts(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return request(`/api/v1/products?${qs.toString()}`);
}

export function productsNearby({ latitude, longitude, radius_km }) {
  const qs = new URLSearchParams({ latitude, longitude, radius_km });
  return request(`/api/v1/products/map?${qs.toString()}`);
}

export function productSlots(productId) {
  return request(`/api/v1/products/${encodeURIComponent(productId)}/slots`);
}

export function bookSlot(slotId, token) {
  return request('/api/v1/bookings', { method: 'POST', body: { slot_id: slotId }, token });
}

export function myBookings(token) {
  return request('/api/v1/bookings', { token });
}

export function adminStats(token) {
  return request('/api/v1/admin/stats', { token });
}

export function createProduct(token, body) {
  return request('/api/v1/products', { method: 'POST', body, token });
}

export function updateProduct(token, id, patch) {
  return request(`/api/v1/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, token });
}

export function deleteProduct(token, id) {
  return request(`/api/v1/products/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}
