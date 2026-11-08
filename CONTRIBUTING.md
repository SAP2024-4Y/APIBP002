# Contributing to APIBP002 — ShopMesh

Thanks for contributing! This repo follows a strict feature-branch + pull-request
workflow so that `main` always stays green and every change is peer-reviewed.

## Workflow

1. **Branch** off the latest `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/<short-topic>    # or fix/…, docs/…, test/…, chore/…
   ```
2. **Commit** in small, focused steps using Conventional Commits
   (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`). Scope when useful,
   e.g. `feat(bookings): …`.
3. **Open a Pull Request** against `main`. Fill in *what* changed and *review
   notes* pointing reviewers at the risky parts.
4. **Get at least one approving review** from a teammate (see `CODEOWNERS`).
   Do not merge your own PR without a review.
5. **CI must be green** (`.github/workflows/ci.yml`: lint + tests + frontend
   build) before merge.
6. **Merge** via the PR (merge commit) and delete the branch.

## Running locally

```bash
npm ci
npm run lint        # ESLint (flat config)
npm test            # Node test runner + supertest (REST + GraphQL)

# Full stack in Docker (serves REST, GraphQL IDE, Swagger, and the React app):
docker compose up   # http://localhost:8080
```

## Code conventions

- Business logic lives in `src/services/*` and must stay framework-agnostic —
  it throws typed `AppError`s (see `src/errors.js`) and never imports Express or
  GraphQL. REST routes and GraphQL resolvers are thin adapters over it.
- Every new domain error gets a code in the catalogue in `src/errors.js`, a
  matching entry in `docs/openapi.yaml`, and parity across both APIs.
- Keep REST and GraphQL in parity: a new filter/field should land on both
  surfaces in the same PR where it makes sense.
- Add or update tests under `tests/` for any behavioural change.

## Project layout

See the "Architecture" section of `README.md` and `docs/ADR.md` for the full
design rationale.
