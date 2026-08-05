// Typed MSW handlers: openapi-msw infers each route's params and response
// bodies from the generated contract types, so a mock that drifts from
// openapi.yaml is a compile error, not a false-positive test.
import { createOpenApiHttp } from "openapi-msw";
import type { paths } from "../../../openapi/generated/schema";
import type { Book, Checkout, Pagination, User } from "../api/types";

// Must match the client's default baseUrl (VITE_API_URL is unset in tests).
export const API_URL = "http://localhost:3000";

export const http = createOpenApiHttp<paths>({ baseUrl: API_URL });

export const testUser: User = { id: 1, email: "reader@example.com" };

let nextId = 100;

export function makeBook(overrides: Partial<Book> = {}): Book {
  nextId += 1;
  return {
    id: nextId,
    title: `Book ${String(nextId)}`,
    author: "Testy Authorson",
    isbn: `978${String(nextId).padStart(10, "0")}`,
    description: null,
    published_year: 2020,
    active_checkout_count: 0,
    available: true,
    ...overrides,
  };
}

export function makeCheckout(book: Book, overrides: Partial<Checkout> = {}): Checkout {
  nextId += 1;
  return {
    id: nextId,
    checked_out_at: "2026-08-01T00:00:00Z",
    expires_at: "2026-08-08T00:00:00Z",
    returned_at: null,
    active: true,
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      available: book.available,
    },
    ...overrides,
  };
}

export function paginationFor(items: readonly unknown[], perPage = 24): Pagination {
  return {
    page: 1,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(items.length / perPage)),
    total_count: items.length,
  };
}

// The always-on plumbing: CSRF token and an authenticated session.
export function sessionHandlers(user: User = testUser) {
  return [
    http.get("/api/csrf", ({ response }) => response(200).json({ csrf_token: "test-csrf-token" })),
    http.get("/api/me", ({ response }) => response(200).json({ user })),
  ];
}
