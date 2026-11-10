'use strict';

const { GraphQLScalarType, Kind, GraphQLError } = require('graphql');
const products = require('../services/products');
const bookings = require('../services/bookings');
const { issueToken } = require('../auth/jwt');
const { AppError } = require('../errors');
const { encodeCursor } = require('../util/cursor');
const { toGeoJSONPoint } = require('../util/geo');

// Map a domain AppError onto a GraphQL error carrying the SAME code the REST
// layer uses — this is how error parity is maintained across both paradigms.
function asGraphQLError(err) {
  if (err instanceof AppError) {
    return new GraphQLError(err.message, {
      extensions: { code: err.code, http: { status: err.status } },
    });
  }
  return err;
}

function guard(fn) {
  try {
    return fn();
  } catch (err) {
    throw asGraphQLError(err);
  }
}

const SORT_ENUM = { CREATED_AT: 'created_at', PRICE: 'price', NAME: 'name', RATING: 'rating', ID: 'id' };

function parseIsoLiteral(value) {
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new GraphQLError('DateTime must be an ISO-8601 string.');
  return new Date(t).toISOString();
}

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 UTC timestamp, e.g. 2026-12-01T09:00:00Z',
  serialize(value) {
    return typeof value === 'string' ? value : new Date(value).toISOString();
  },
  parseValue(value) {
    return parseIsoLiteral(String(value));
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('DateTime must be a string literal.');
    return parseIsoLiteral(ast.value);
  },
});

function windowOverlaps(slot, from, to) {
  if (from && !(slot.ends_at > from)) return false;
  if (to && !(slot.starts_at < to)) return false;
  return true;
}

const resolvers = {
  DateTime,

  Query: {
    product: (_root, { id }) =>
      guard(() => {
        try {
          return products.getProductById(id);
        } catch (err) {
          if (err instanceof AppError && err.code === 'PRODUCT_NOT_FOUND') return null;
          throw err;
        }
      }),

    products: (_root, args) =>
      guard(() => {
        const filters = {
          status: args.status,
          category: args.category,
          minPrice: args.minPrice,
          maxPrice: args.maxPrice,
        };
        const result = products.listProducts({
          ...filters,
          sort: SORT_ENUM[args.sort || 'CREATED_AT'],
          order: String(args.order || 'DESC').toLowerCase(),
          limit: args.first,
          after: args.after,
        });
        const col = result.column;
        const edges = result.items.map((row) => ({
          cursor: encodeCursor(row[col], row.id),
          node: row,
        }));
        return {
          edges,
          pageInfo: {
            hasNextPage: result.hasMore,
            endCursor: edges.length ? edges[edges.length - 1].cursor : null,
          },
          totalCount: products.countProducts(filters),
        };
      }),

    productsNear: (_root, args) =>
      guard(() =>
        products
          .productsNear({ latitude: args.latitude, longitude: args.longitude, radiusKm: args.radiusKm })
          .map((hit) => ({ product: hit.product, distanceKm: hit.distanceKm }))
      ),

    productsInBounds: (_root, args) =>
      guard(() =>
        products.productsInBounds({
          minLat: args.minLat,
          minLon: args.minLon,
          maxLat: args.maxLat,
          maxLon: args.maxLon,
        })
      ),

    slots: (_root, args) =>
      guard(() =>
        bookings.listSlots({ productId: args.productId, startsAt: args.startsAt, endsAt: args.endsAt })
      ),

    myBookings: (_root, _args, ctx) =>
      guard(() => {
        if (!ctx.user) throw new AppError('UNAUTHENTICATED');
        return bookings.listBookingsForUser(ctx.user.username);
      }),
  },

  Mutation: {
    requestToken: (_root, { username, password }) =>
      guard(() => {
        const result = issueToken(username, password);
        return { token: result.token, tokenType: result.tokenType, expiresIn: result.expiresIn };
      }),

    bookSlot: (_root, { slotId, quantity }, ctx) =>
      guard(() => {
        if (!ctx.user) throw new AppError('UNAUTHENTICATED');
        return bookings.createBooking({ slotId, quantity, username: ctx.user.username });
      }),
  },

  Product: {
    priceInPaise: (p) => p.price_paise,
    price: (p) => p.price_paise / 100,
    createdAt: (p) => p.created_at,
    location: (p) => toGeoJSONPoint(p.longitude, p.latitude),
    slots: (p, args, ctx) =>
      ctx.loaders.slotsByProduct
        .load(p.id)
        .then((slots) => slots.filter((s) => windowOverlaps(s, args.startsAt, args.endsAt))),
  },

  Slot: {
    productId: (s) => s.product_id,
    startsAt: (s) => s.starts_at,
    endsAt: (s) => s.ends_at,
    available: (s) => s.capacity - s.booked,
    product: (s, _args, ctx) => ctx.loaders.productById.load(s.product_id),
  },

  Booking: {
    slotId: (b) => b.slot_id,
    user: (b) => b.username,
    createdAt: (b) => b.created_at,
  },
};

module.exports = { resolvers, asGraphQLError };
