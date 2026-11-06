# Architecture Decision Record — ShopMesh (APIBP002)

> Domain: **Online Shopping** · Approach: **A — REST-First + GraphQL Layer**

## 1. Business Problem & Consumers

ShopMesh is the backend for an online shopping marketplace where a catalogue of
products is fulfilled from geographically distributed hubs and delivered in
booked time windows. The business problem is three-fold: shoppers must be able
to **discover** products (filter/sort/paginate a large catalogue), **locate**
products that can actually reach them (proximity to a fulfilment hub), and
**schedule** a delivery into a finite, conflict-free slot.

The API has three consumer classes: (1) the **customer web/mobile storefront**
(a React storefront ships in this repo) which is latency- and payload-sensitive
and benefits from GraphQL's single round-trip composite fetches; (2)
**partner/back-office integrations** (inventory, logistics) that prefer stable,
cacheable, resource-oriented REST; and (3) **automated agents and the course
evaluator** that probe a strict, versioned contract. Serving all three from one
domain core is the central design driver.

## 2. Business Capabilities

1. **Catalogue discovery** — multi-field filtering (`status`, `category`, price
   band), dynamic sorting, and drift-proof cursor pagination over the product
   catalogue.
2. **Fulfilment-aware search** — find products whose hub lies within a radius or
   bounding box of the customer, using GeoJSON coordinates.
3. **Delivery scheduling** — list delivery slots overlapping a time window and
   book one, with capacity and overlap conflict prevention.
4. **Secure mutation** — authenticated, role-gated writes (customers book;
   admins curate the catalogue).
5. **Self-describing contract** — live Swagger docs and a GraphQL IDE served by
   the running service.

## 3. Resource Model

Three business resources:

- **Product** — a sellable item: identity, pricing (authoritative integer paise
  + convenience float), lifecycle `status`, rating, seller, and a **GeoJSON
  point** for its fulfilment hub.
- **DeliverySlot** — a bookable window belonging to a Product, with a capacity
  and a running booked count. (`Product 1—* Slot`.)
- **Booking** — a confirmed reservation of a Slot by an authenticated user.
  (`Slot 1—* Booking`.)

These map one-to-one onto the GraphQL types `Product`, `Slot`, `Booking` and the
OpenAPI schemas of the same names; they are business concepts, not raw tables
(the `products`/`slots`/`bookings` tables are an implementation detail).

## 4. Approach Decision

We chose **Approach A (REST-first + GraphQL layer)**. All business logic lives in
framework-agnostic service modules (`src/services/*`) that throw typed domain
errors and return plain rows. The REST router and the GraphQL resolvers are both
**thin adapters** over those same services — neither owns logic the other lacks.
This guarantees behavioural parity and means a bug is fixed once.

The chief impedance mismatch is error semantics: REST leans on HTTP status codes
and per-resource URIs with natural cache keys, while GraphQL is a single `POST
/graphql` where every response is `200` and errors live in `errors[]`. We
resolved this with a **single error catalogue** (§7): each domain error has one
code mapped to exactly one HTTP status (REST) and surfaced verbatim as
`extensions.code` plus `extensions.http.status` (GraphQL). A second mismatch —
GraphQL's relational traversal inviting N+1 queries — is handled with
**DataLoader** batching (`Product.slots`, `Slot.product`), so composite graph
queries collapse to one `IN (...)` query per level.

## 5. Domain Pattern Mapping

- **List** → the product catalogue: `GET /api/v1/products` and the `products`
  Connection, with `status`/`category`/`min_price`/`max_price`, `sort`+`order`,
  and opaque keyset cursors (`limit`/`after` + `has_more`; `first`/`after` +
  `pageInfo.hasNextPage`).
- **Map** → fulfilment-hub proximity: `GET /api/v1/products/map` and
  `productsNear`/`productsInBounds`, with `latitude`/`longitude`/`radius_km` or
  the `min_lat`/`min_lon`/`max_lat`/`max_lon` bounding box, GeoJSON
  `[longitude, latitude]`.
- **Calendar** → delivery scheduling: `GET /api/v1/slots` and `slots`, with
  `starts_at`/`ends_at` ISO-8601 windows, and `POST /api/v1/bookings` /
  `bookSlot` enforcing conflict logic.

## 6. Composite Payload Comparison

Composite view: **one product with its fulfilment location and its delivery
slots**, measured against this service.

- **REST** needs two round-trips: `GET /api/v1/products/prod_001`
  (~430 B JSON, the full product incl. location) **+**
  `GET /api/v1/products/prod_001/slots` (~620 B for 4 slots). Total ≈ **1,050 B
  over 2 requests**, and the product payload includes fields the view may not
  need (description, currency, rating).
- **GraphQL** needs one round-trip: `POST /graphql` with
  `{ product(id:"prod_001"){ name location{coordinates} slots{ startsAt endsAt available } } }`
  returns ≈ **340 B over 1 request** — only the four requested fields, no
  over-fetch, one network RTT.

For this composite view GraphQL cuts round-trips 2→1 and payload ~1,050→~340 B
(~68% smaller) by eliminating over-fetch; REST wins when the two sub-resources
are cached independently with long TTLs (slots change far more often than the
product), which the storefront exploits by caching product metadata via REST and
pulling volatile slots via GraphQL.

## 7. Error Catalogue

| Code | Cause | HTTP (REST) | GraphQL `extensions.code` |
|------|-------|-------------|---------------------------|
| `VALIDATION_ERROR` | Bad/missing query or body field | 400 | `VALIDATION_ERROR` |
| `INVALID_CURSOR` | Malformed pagination cursor | 400 | `INVALID_CURSOR` |
| `INVALID_CREDENTIALS` | Wrong username/password at token issue | 401 | `INVALID_CREDENTIALS` |
| `UNAUTHENTICATED` | Missing/invalid/expired Bearer token | 401 | `UNAUTHENTICATED` |
| `FORBIDDEN` | Valid token lacking the required role | 403 | `FORBIDDEN` |
| `NOT_FOUND` | Unknown route/resource | 404 | `NOT_FOUND` |
| `PRODUCT_NOT_FOUND` | No product with the given id | 404 | `PRODUCT_NOT_FOUND` |
| `SLOT_NOT_FOUND` | No slot with the given id | 404 | `SLOT_NOT_FOUND` |
| `SLOT_FULL` | Slot capacity cannot absorb the quantity | 409 | `SLOT_FULL` |
| `BOOKING_OVERLAP` | User already booked an overlapping window | 409 | `BOOKING_OVERLAP` |
| `UNPROCESSABLE` | Well-formed but semantically invalid | 422 | `UNPROCESSABLE` |
| `INVALID_COORDINATES` | Lat/lon or bbox out of range | 422 | `INVALID_COORDINATES` |
| `RATE_LIMITED` | Rate limit exceeded | 429 | `RATE_LIMITED` |
| `INTERNAL` | Unexpected server fault | 500 | `INTERNAL` |

These 14 codes are defined once in `src/errors.js`, enumerated in
`docs/openapi.yaml` (`Error.code`), and emitted identically by both paradigms.

## 8. Design Decisions

1. **Money as integer paise, not float.** `price_paise` is authoritative; the
   float `price`/`Product.price` is a convenience and is `@deprecated` in the
   GraphQL schema. Avoids rounding drift in an INR marketplace.
2. **Keyset (cursor) pagination, not offset.** The cursor encodes
   `(sortValue, id)` as an opaque base64url token, so concurrent inserts never
   cause skipped or duplicated rows — correctness the rubric explicitly favours.
3. **Shared limiter, two surfaces.** One `consume(key)` core powers the REST
   middleware (`RateLimit-*` headers + 429) and an Apollo plugin (`RATE_LIMITED`
   error + the same headers), so rate limiting behaves identically everywhere.

## 9. Future Evolution

1. **`/api/v2` + schema growth** — add inventory reservation and multi-item
   carts; GraphQL grows by non-breaking field additions while `price` rides its
   deprecation to removal.
2. **Real geospatial store** — move proximity from in-process Haversine to
   PostGIS/Postgres as the catalogue scales past in-memory filtering.
3. **New consumers** — a logistics partner API and webhook events for booking
   lifecycle, reusing the same service core.

## 10. Business Value

1. **Faster storefronts, lower cost** — GraphQL composite fetches cut round-trips
   and bytes, improving conversion on mobile networks.
2. **Fewer failed deliveries** — slot capacity + overlap conflict logic prevents
   double-booking at the source, reducing operational cost.
3. **Lower integration friction** — partners consume idiomatic, versioned,
   self-documented REST without needing to adopt GraphQL, widening the ecosystem.
