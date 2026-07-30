# Online Library

A take-home engineering exercise built with a Rails API, PostgreSQL, and React.

## Run locally

1. Copy the example environment file: `cp .env.example .env`.
2. Start the full stack: `docker compose up --build`.
3. Open the React app at [http://localhost:5173](http://localhost:5173). The Rails health endpoint is available at [http://localhost:3000/up](http://localhost:3000/up).

The database is stored in the `postgres_data` Docker volume. To rebuild it from scratch, run `docker compose down -v`, then start the stack again.

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

Authentication and library functionality will be added in subsequent steps.
