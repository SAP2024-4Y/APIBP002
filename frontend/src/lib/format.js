const moneyFormats = new Map();

function formatter(currency, fraction) {
  const key = `${currency}:${fraction}`;
  if (!moneyFormats.has(key)) {
    moneyFormats.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
      })
    );
  }
  return moneyFormats.get(key);
}

// Amounts arrive as integer minor units (paise) plus an ISO 4217 code.
export function money(minor, currency = 'INR') {
  const value = Number(minor) || 0;
  return formatter(currency || 'INR', value % 100 === 0 ? 0 : 2).format(value / 100);
}

export const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';

export function utcOffsetLabel(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  const abs = Math.abs(minutes);
  const sign = minutes >= 0 ? '+' : '−';
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function relDay(iso) {
  const diff = Math.round((startOfDay(iso) - startOfDay(new Date())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

export const cityOf = (seller) => (seller || '').replace(/\s*Fulfil(l)?ment Hub$/i, '').trim() || 'Unassigned hub';

export const fmtKm = (km) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-IN')} km`);

export const fmtBytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export const fmtMs = (ms) => (ms == null ? '—' : `${Math.round(ms)} ms`);

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
