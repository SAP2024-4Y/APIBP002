# APIBP002 — ShopMesh

A production-style backend for an **Online Shopping** marketplace, exposing the
**same domain over both a REST API and a GraphQL API** (Approach A: REST-first
with a GraphQL layer over shared services). Includes JWT auth, rate limiting,
cursor pagination, geospatial + calendar queries, DataLoader batching, live
Swagger docs, an embedded GraphQL IDE, and a React storefront.

## Team Details

| # | Name            | Roll No            | GitHub ID        | Email                      |
|---|-----------------|--------------------|------------------|----------------------------|
| 1 | Aadarsh Verma   | `2024sl70013`      | CodeAadarsh      | aadarsh24lv@gmail.com      |
| 2 | Divyansh Jha    | `2024sl70022`      | divyanshjha30    | divyanshjha30@gmail.com    |
| 3 | Parimita Sarkar | `2024sl70018`      | parimitasarkar   | parimitasarkar1@gmail.com  |
| 4 | Simarpreet Singh| `2024sl70046`      | simar295         | simarconnect@gmail.com     |

- Team ID: `APIBP002` (equals the repository name and `team.json.team_id`)
- Chosen Approach: `A` — REST-First + GraphQL Layer (equals `team.json.approach`)

## Quick start

```bash
git clone https://github.com/SAP2024-4Y/APIBP002
cd APIBP002
docker compose up
# Server:      http://localhost:8080
# Health:      http://localhost:8080/health
# REST docs:   http://localhost:8080/docs        (Swagger UI, served live)
# Raw OpenAPI: http://localhost:8080/openapi.yaml
# GraphQL IDE: http://localhost:8080/graphql      (Apollo Sandbox)
# Storefront:  http://localhost:8080/             (React frontend)
```

`docker compose up` builds the image, creates the SQLite schema, and **seeds 24
products** (each with coordinates and delivery slots) automatically — no manual
migrate/seed step. The server is ready well within 120 seconds. `docker compose
down` then `up` again is safe and idempotent (no mounted volume; schema uses
`CREATE TABLE IF NOT EXISTS`).

## Demo credentials

State-mutating endpoints require a Bearer token. Obtain one from the documented
demo account:

```bash
POST /api/v1/auth/token   { "username": "demo", "password": "demo-password" }
```

- `demo` / `demo-password` → role `customer` (can book slots).
- `admin` / `admin-password` → role `admin` (can also create products).
- Invalid credentials → `401`. Missing/invalid token on a mutation → `401`.
  Valid token lacking the role (e.g. `demo` creating a product) → `403`.

## Sample REST calls

```bash
# 1) Get a token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo-password"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

# 2) List API — filter + sort + cursor pagination
curl "http://localhost:8080/api/v1/products?status=active&category=Electronics&min_price=1000&max_price=20000&sort=price&order=asc&limit=5"
# response carries data[], has_more, next_cursor — feed next_cursor back as &after=<cursor>

# 3) Map API — proximity (radius) and bounding box
curl "http://localhost:8080/api/v1/products/map?latitude=12.9716&longitude=77.5946&radius_km=50"
curl "http://localhost:8080/api/v1/products/map?min_lat=8&min_lon=68&max_lat=37&max_lon=97"

# 4) Calendar API — slots in a window
curl "http://localhost:8080/api/v1/slots?product_id=prod_001&starts_at=2026-12-01T00:00:00Z&ends_at=2026-12-31T00:00:00Z"

# 5) Mutating request (JWT required) — book a slot (201 + created id)
curl -X POST http://localhost:8080/api/v1/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"slot_id":"slot_002_1"}'
```

## Sample GraphQL

Open `http://localhost:8080/graphql` and run:

```graphql
query {
  products(first: 5, status: active, sort: PRICE, order: ASC) {
    totalCount
    edges { cursor node { id name priceInPaise location { coordinates } slots { startsAt available } } }
    pageInfo { hasNextPage endCursor }
  }
  productsNear(latitude: 19.0760, longitude: 72.8777, radiusKm: 10) { distanceKm product { name } }
}
```

Mutations (set an `Authorization: Bearer <token>` header in the IDE):

```graphql
mutation { requestToken(username: "demo", password: "demo-password") { token } }
mutation { bookSlot(slotId: "slot_002_1", quantity: 1) { id slotId createdAt } }
```

## Run tests locally

```bash
# Backend lint + integration tests (Node's built-in test runner + supertest)
npm ci
npm run lint
npm test

# Or inside Docker, matching CI:
docker compose run --rm app npm test
```

CI (`.github/workflows/ci.yml`) runs lint + tests + the frontend build on every
pull request and on pushes to `main`.

## Architecture

```
src/
  services/      domain logic (framework-agnostic; throws typed AppError)
  rest/          Express routers + presenters  -> /api/v1/*
  graphql/       Apollo schema, resolvers, DataLoader loaders -> /graphql
  middleware/    shared rate limiter + central error handler
  auth/          JWT issue/verify + role guards
  db/            better-sqlite3 client (schema) + idempotent seed
docs/
  openapi.yaml   authoritative REST contract (served at /docs)
  schema.graphql authoritative GraphQL SDL (loaded by the server)
  ADR.md         architecture decision record
frontend/        React (Vite) storefront, built into the image and served at /
```

Both APIs call the **same service layer**, so behaviour and the 14-code error
catalogue stay in parity across REST and GraphQL. See `docs/ADR.md` for the full
rationale, resource model, payload comparison, and error catalogue.

## Tech stack

Node.js 20 · Express · Apollo Server (GraphQL) · better-sqlite3 · JWT ·
swagger-ui-express · DataLoader · React + Vite · Docker.
