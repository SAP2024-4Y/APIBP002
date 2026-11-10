'use strict';

const { getDb } = require('../db/client');

// Aggregate catalogue + booking metrics for the admin dashboard.
function adminStats() {
  const db = getDb();
  const totals = db
    .prepare(
      'SELECT COUNT(*) AS products, COALESCE(SUM(inventory),0) AS inventory, COALESCE(SUM(price_paise),0) AS value_paise FROM products'
    )
    .get();
  const byStatusRows = db.prepare('SELECT status, COUNT(*) AS c FROM products GROUP BY status').all();
  const bookings = db.prepare('SELECT COUNT(*) AS c FROM bookings').get().c;
  const lowStock = db.prepare('SELECT COUNT(*) AS c FROM products WHERE inventory > 0 AND inventory < 30').get().c;
  const outOfStock = db.prepare("SELECT COUNT(*) AS c FROM products WHERE inventory = 0").get().c;

  return {
    products: totals.products,
    total_inventory: totals.inventory,
    catalogue_value_paise: totals.value_paise,
    bookings,
    low_stock: lowStock,
    out_of_stock: outOfStock,
    by_status: Object.fromEntries(byStatusRows.map((r) => [r.status, r.c])),
  };
}

module.exports = { adminStats };
