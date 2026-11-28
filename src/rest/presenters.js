'use strict';

const { toGeoJSONPoint } = require('../util/geo');

function productToRest(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price_paise / 100,
    price_paise: row.price_paise,
    currency: row.currency,
    status: row.status,
    seller: row.seller,
    rating: row.rating,
    inventory: row.inventory,
    location: toGeoJSONPoint(row.longitude, row.latitude),
    created_at: row.created_at,
  };
}

function slotToRest(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    capacity: row.capacity,
    booked: row.booked,
    available: row.capacity - row.booked,
  };
}

function bookingToRest(row) {
  const out = {
    id: row.id,
    slot_id: row.slot_id,
    user: row.username,
    quantity: row.quantity,
    created_at: row.created_at,
  };
  if (row.product_id !== undefined) out.product_id = row.product_id;
  return out;
}

module.exports = { productToRest, slotToRest, bookingToRest };
