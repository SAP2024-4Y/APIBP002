'use strict';

const express = require('express');
const products = require('../services/products');
const bookings = require('../services/bookings');
const { requireAuth, requireRole } = require('../auth/middleware');
const { AppError } = require('../errors');
const { productToRest, slotToRest } = require('./presenters');

const router = express.Router();

// GET /api/v1/products — List API: filter + sort + cursor pagination
router.get('/', (req, res, next) => {
  try {
    const result = products.listProducts({
      status: req.query.status,
      category: req.query.category,
      q: req.query.q,
      minPrice: req.query.min_price,
      maxPrice: req.query.max_price,
      sort: req.query.sort,
      order: req.query.order,
      limit: req.query.limit,
      after: req.query.after,
    });
    res.status(200).json({
      data: result.items.map(productToRest),
      has_more: result.hasMore,
      next_cursor: result.nextCursor,
      limit: result.limit,
      sort: result.sort,
      order: result.order,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/products/map — Map API: proximity (radius) OR bounding box
router.get('/map', (req, res, next) => {
  try {
    const q = req.query;
    const hasBox = ['min_lat', 'min_lon', 'max_lat', 'max_lon'].every((k) => q[k] !== undefined);
    const hasRadius = ['latitude', 'longitude', 'radius_km'].every((k) => q[k] !== undefined);

    if (hasBox) {
      const rows = products.productsInBounds({
        minLat: q.min_lat,
        minLon: q.min_lon,
        maxLat: q.max_lat,
        maxLon: q.max_lon,
      });
      return res.status(200).json({ mode: 'bbox', count: rows.length, data: rows.map(productToRest) });
    }
    if (hasRadius) {
      const hits = products.productsNear({
        latitude: q.latitude,
        longitude: q.longitude,
        radiusKm: q.radius_km,
      });
      return res.status(200).json({
        mode: 'radius',
        count: hits.length,
        data: hits.map((h) => ({ ...productToRest(h.product), distance_km: Number(h.distanceKm.toFixed(3)) })),
      });
    }
    throw new AppError(
      'VALIDATION_ERROR',
      'Provide either (latitude, longitude, radius_km) or (min_lat, min_lon, max_lat, max_lon).'
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/products — admin-only mutation (demo token -> 403, admin -> 201)
router.post('/', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    const created = products.createProduct(req.body || {});
    res.status(201).json({ created: productToRest(created) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/products/:id — admin-only partial update
router.patch('/:id', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    const updated = products.updateProduct(req.params.id, req.body || {});
    res.status(200).json({ updated: productToRest(updated) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/products/:id — admin-only; cascades slots + bookings
router.delete('/:id', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    res.status(200).json(products.deleteProduct(req.params.id));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/products/:id
router.get('/:id', (req, res, next) => {
  try {
    res.status(200).json(productToRest(products.getProductById(req.params.id)));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/products/:id/slots — convenience Calendar view for one product
router.get('/:id/slots', (req, res, next) => {
  try {
    products.getProductById(req.params.id); // 404 if the product is unknown
    const rows = bookings.listSlots({
      productId: req.params.id,
      startsAt: req.query.starts_at,
      endsAt: req.query.ends_at,
    });
    res.status(200).json({ data: rows.map(slotToRest) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
