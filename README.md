# Online Library

A take-home engineering exercise built with a Rails API, PostgreSQL, and React.

## Candidate brief

This is an application that allows users to check books out of an online library and read them. Imagine you've inherited ownership of the product. As the owner, you decide what you want to spend time on: new features, tooling, performance, code quality, UI/UX, etc. 

## Prerequisites

The supported setup uses Docker Desktop. For a non-Docker setup, use Ruby 3.3.4, Node 18+, and PostgreSQL 16 (or a compatible PostgreSQL version).

## Run locally

1. Copy the example environment file: `cp .env.example .env`.
2. Start the full stack: `docker compose up --build`.
3. Open the React app at [http://localhost:5173](http://localhost:5173). The Rails health endpoint is available at [http://localhost:3000/up](http://localhost:3000/up).

The default ports are configured in `.env.example`. Change `API_PORT`, `WEB_PORT`, or `POSTGRES_PORT` in your local `.env` if they conflict with another service. If you change `API_PORT`, use that port for the health endpoint instead of `3000`.

The database is stored in the `postgres_data` Docker volume. `docker compose down -v` permanently removes that local database volume and all of its data. Run it only when you want a completely fresh environment; then start the stack and seed it again.

To populate a realistic development dataset, run:

```sh
docker compose exec api bin/rails db:seed
```

This creates 5,000 books, 750 demo readers, 2,500 active checkouts, and 12,500 expired checkout records. The demo account `reader1@example.com` uses password `password123`. Re-running the seed command replaces only its own demo records.

## AI librarian (optional)

The sidebar includes an "Ask the librarian" chat that answers natural-language requests ("something short and funny about time travel") by searching the real catalog with Claude, so it only recommends books that exist here. To enable it, set `ANTHROPIC_API_KEY` in your local `.env` (get a key at [platform.claude.com](https://platform.claude.com)) and restart the stack. Without a key the endpoint returns a clear "librarian is offline" message and the rest of the app is unaffected. The endpoint is authenticated and rate-limited to 10 requests per 3 minutes.

## Tests and verification

`openapi/openapi.yaml` is the single source of truth for the API. The frontend's client types are generated from it (`npm run gen:api`; CI fails if the committed types drift), the test suites validate every response against it, and Schemathesis fuzzes the running server for conformance.

Start the isolated test stack — a test-only Rails server and database on `127.0.0.1:3101` plus a frontend on `127.0.0.1:5175`; the seeded dev stack is untouched:

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
```

Then, from the repo root (Node 22+):

```sh
npm install && npm --prefix web install && npm --prefix tests install

npm test                    # typecheck + lint + web component tests + black-box API suite
npm run typecheck           # tsc (web + tests) + ESLint (strict-type-checked, assertion ban)
npm run test:web            # component tests against contract-typed MSW mocks
npm run test:api            # black-box API suite (Vitest), then the serial rate-limit spec
npm run test:e2e            # Playwright journeys (npx --prefix tests playwright install chromium first)
./scripts/schemathesis.sh   # property-based contract fuzzing (needs uv, or pip install schemathesis)
npm run gen:check           # regenerate types from openapi.yaml and fail on drift
```

The one remaining Ruby test file is `api/test/services/librarian_search_test.rb` (see the philosophy section for why):

```sh
docker compose exec api bin/rails test
```

Note: the test API server runs `RAILS_ENV=test`, which does not reload code — restart `api_test` after changing Ruby files. The web production build is verified with `docker compose exec web npm run build`.

## Type safety and testing philosophy

The stack is typed end to end and tested almost entirely from the outside in:

- **Compile time.** The frontend is strict TypeScript (`@total-typescript/tsconfig`, `ts-reset`, ESLint `strict-type-checked` with type assertions banned outside `as const` and generated code). Every API call goes through an `openapi-fetch` client typed by the generated schema, so a request that disagrees with the contract cannot compile. MSW mock handlers are typed from the same schema, so a stale mock is a compile error rather than a false-positive test.
- **Runtime.** The black-box suite validates every response's status, content type, and body against `openapi.yaml` (ajv, 2020-12 dialect), and Schemathesis generates ~1,200 fuzz cases per run from the same file. Fuzzing found three real server bugs during development — null-byte parameters 500ing inside Postgres, a bigint overflow via astronomical `page=` values, and framework debug 404s leaking exception traces — all fixed and now regression-guarded by the contract.
- **No unit tests, deliberately.** Anything observable over HTTP is tested over HTTP against the real server and database. A test-environment-only seam (`TEST_SEAM=enabled`: reset / factory / login_as, deliberately absent from the contract) creates otherwise unreachable states such as expired checkouts, and lets eight real sessions race the borrow path (exactly 5 must win). One documented exception survives: `librarian_search_test.rb` covers catalog-ranking SQL that is reachable in production only through the librarian's LLM tool call, so no black-box test can exercise it.
- **No runtime validation in the app itself.** API responses are triple-covered — generated compile-time types in the client, ajv validation in the test suite, Schemathesis conformance against the server — so app-side schema validation (zod et al.) would only add bundle weight and a second source of truth that could drift from the YAML.

Known coverage exceptions, accepted knowingly: the login timing-equalization defense is not asserted (network jitter dwarfs bcrypt timing over HTTP), and the librarian's 200 reply path requires a real `ANTHROPIC_API_KEY` (its auth, validation, rate-limit, and offline surfaces are fully tested without one).

## Services

- `web`: React + Vite development server
- `api`: Rails API server
- `db`: PostgreSQL 16

## Local commands without Docker

The API expects PostgreSQL credentials in `POSTGRES_*` environment variables (see `.env.example`).

```sh
cd api && bundle install && bin/rails db:prepare && bin/rails server
cd web && npm install && npm run dev
```

## API reference

The canonical, machine-checked API reference is [`openapi/openapi.yaml`](openapi/openapi.yaml). The sections below are a human-oriented summary.

## Authentication API

Authentication uses an email/password account and a signed, HTTP-only Rails session cookie. Mutating authentication requests require a CSRF token from `GET /api/csrf` and must send it as `X-CSRF-Token`.

- `GET /api/csrf`
- `POST /api/auth/sign_up`
- `POST /api/auth/login`
- `DELETE /api/auth/logout`
- `GET /api/me`

For browser clients, send requests with credentials enabled so the session cookie is retained. A registration request looks like:

```json
{
  "user": {
    "email": "reader@example.com",
    "password": "secure-password",
    "password_confirmation": "secure-password"
  }
}
```

Login accepts a top-level `email` and `password` object. Send the CSRF token from `/api/csrf` as the `X-CSRF-Token` header for registration, login, logout, and checkout creation.

## Library API and behavior

All library routes require an authenticated session.

- `GET /api/books?query=` searches title, author, and ISBN.
- `GET /api/books/:id` returns a single book and its current availability.
- `GET /api/books/:id/read` returns readable content for an active checkout.
- `GET /api/checkouts` returns the current user's active and expired checkout history.
- `POST /api/checkouts` accepts `{ "book_id": 123 }` and requires `X-CSRF-Token`.

Users can have up to 10 active checkouts. A book can have up to 5 active checkouts. Each checkout expires automatically one week after it is created; expired checkouts no longer consume either limit.

`GET /api/books/:id/read` returns a book's plain-text content only when the signed-in user has an active checkout for that book. Content is stored locally at `api/storage/library/books/<isbn>.txt`, which mirrors a production object-storage key without requiring S3. `db:seed` creates the Lorem Ipsum content files.
