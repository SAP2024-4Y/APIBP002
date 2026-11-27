// Mirrors the closed enums documented in docs/openapi.yaml (Category, status).
export const CATEGORIES = ['Electronics', 'Fashion', 'Home & Kitchen', 'Books', 'Grocery', 'Sports', 'Beauty'];

export const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'discontinued', label: 'Discontinued' },
];

export const statusLabel = (s) => (STATUSES.find((x) => x.value === s) || { label: s }).label;

export const SORTS = [
  { key: 'newest', label: 'Newest first', sort: 'created_at', order: 'desc' },
  { key: 'price_asc', label: 'Price: low to high', sort: 'price', order: 'asc' },
  { key: 'price_desc', label: 'Price: high to low', sort: 'price', order: 'desc' },
  { key: 'rating', label: 'Top rated', sort: 'rating', order: 'desc' },
  { key: 'name', label: 'Name A–Z', sort: 'name', order: 'asc' },
];

const CATEGORY_STYLE = {
  Electronics: { icon: '🎧', hue: 205 },
  Fashion: { icon: '👟', hue: 18 },
  'Home & Kitchen': { icon: '🍳', hue: 150 },
  Books: { icon: '📚', hue: 265 },
  Grocery: { icon: '🧺', hue: 42 },
  Sports: { icon: '🏸', hue: 185 },
  Beauty: { icon: '✨', hue: 330 },
};

export const categoryStyle = (c) => CATEGORY_STYLE[c] || { icon: '🛍️', hue: 32 };

const KEYWORD_ICONS = [
  [/earbud|headphone/i, '🎧'],
  [/watch/i, '⌚'],
  [/keyboard/i, '⌨️'],
  [/camera/i, '📷'],
  [/shirt/i, '👔'],
  [/shoe|sneaker/i, '👟'],
  [/jacket|coat/i, '🧥'],
  [/wallet/i, '👛'],
  [/trouser|jeans/i, '👖'],
  [/skillet|\bpan\b|wok/i, '🍳'],
  [/coffee|bean|roast/i, '☕'],
  [/pillow|mattress/i, '🛏️'],
  [/planter|plant\b/i, '🪴'],
  [/purifier/i, '🌬️'],
  [/\boil\b/i, '🫒'],
  [/salt/i, '🧂'],
  [/yoga/i, '🧘'],
  [/dumbbell|kettlebell/i, '🏋️'],
  [/serum|cream|lotion/i, '🧴'],
  [/backpack|\bbag\b/i, '🎒'],
];

export function productIcon(p) {
  const hit = KEYWORD_ICONS.find(([re]) => re.test(p.name || ''));
  return hit ? hit[1] : categoryStyle(p.category).icon;
}

export const DEMO_ACCOUNTS = [
  { username: 'demo', password: 'demo-password', role: 'customer', label: 'Customer', blurb: 'Browse, book and cancel deliveries' },
  { username: 'admin', password: 'admin-password', role: 'admin', label: 'Admin', blurb: 'Everything above + manage the catalogue' },
];
