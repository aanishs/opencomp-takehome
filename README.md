# Online Library

A take-home engineering exercise built with a Rails API, PostgreSQL, and React.

## Run locally

1. Copy the example environment file: `cp .env.example .env`.
2. Start the full stack: `docker compose up --build`.
3. Open the React app at [http://localhost:5173](http://localhost:5173). The Rails health endpoint is available at [http://localhost:3000/up](http://localhost:3000/up).

The database is stored in the `postgres_data` Docker volume. To rebuild it from scratch, run `docker compose down -v`, then start the stack again.

To populate a realistic development dataset, run:

```sh
docker compose exec api bin/rails db:seed
```

This creates 5,000 books, 750 demo readers, 2,500 active checkouts, and 12,500 expired checkout records. The demo account `reader1@example.com` uses password `password123`. Re-running the seed command replaces only its own demo records.

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

- `POST /api/auth/sign_up`
- `POST /api/auth/login`
- `DELETE /api/auth/logout`
- `GET /api/me`

## Library API and behavior

All library routes require an authenticated session.

- `GET /api/books?query=` searches title, author, and ISBN.
- `GET /api/books/:id` returns a single book and its current availability.
- `GET /api/checkouts` returns the current user's checkouts.
- `POST /api/checkouts` accepts `{ "book_id": 123 }` and requires `X-CSRF-Token`.

Users can have up to 10 active checkouts. A book can have up to 5 active checkouts. Each checkout expires automatically one week after it is created; expired checkouts no longer consume either limit.

`GET /api/books/:id/read` returns a book's plain-text content only when the signed-in user has an active checkout for that book. Content is stored locally at `api/storage/library/books/<isbn>.txt`, which mirrors a production object-storage key without requiring S3. `db:seed` creates the Lorem Ipsum content files.
