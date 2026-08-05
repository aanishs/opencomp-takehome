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

With the stack running:

```sh
docker compose exec api bin/rails test
docker compose exec web npm run build
```

For a non-Docker setup, prepare the test database before running Rails tests:

```sh
cd api && RAILS_ENV=test bin/rails db:prepare && bin/rails test
cd web && npm run build
```

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
