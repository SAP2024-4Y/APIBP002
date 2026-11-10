'use strict';

const DataLoader = require('dataloader');
const { getDb } = require('../db/client');

// Created fresh per request so cached rows never leak across callers.
function createLoaders() {
  const db = getDb();

  const productById = new DataLoader(async (ids) => {
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id) || null);
  });

  const slotsByProduct = new DataLoader(async (productIds) => {
    const placeholders = productIds.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM slots WHERE product_id IN (${placeholders}) ORDER BY starts_at ASC`)
      .all(...productIds);
    const grouped = new Map(productIds.map((id) => [id, []]));
    for (const row of rows) {
      if (grouped.has(row.product_id)) grouped.get(row.product_id).push(row);
    }
    return productIds.map((id) => grouped.get(id) || []);
  });

  return { productById, slotsByProduct };
}

module.exports = { createLoaders };
