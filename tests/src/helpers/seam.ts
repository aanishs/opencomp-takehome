// Client for the test-seam endpoints (reset / factory / login_as). These are
// deliberately outside the OpenAPI contract, so their shapes are hand-typed
// and parsed here instead of generated.
import { BASE_URL } from "./config";

export interface FactoryUserAttrs {
  email: string;
  password?: string;
}

export interface FactoryBookAttrs {
  title?: string;
  author?: string;
  isbn?: string;
  description?: string;
  published_year?: number;
  content?: string;
}

export interface FactoryCheckoutAttrs {
  user_id: number;
  book_id: number;
  checked_out_at?: string;
  expires_at?: string;
  returned_at?: string;
}

export interface FactoryRequest {
  users?: FactoryUserAttrs[];
  books?: FactoryBookAttrs[];
  checkouts?: FactoryCheckoutAttrs[];
}

export interface SeamUser {
  id: number;
  email: string;
}

export interface SeamBook {
  id: number;
  title: string;
  isbn: string;
}

export interface SeamCheckout {
  id: number;
  user_id: number;
  book_id: number;
  checked_out_at: string;
  expires_at: string;
  returned_at: string | null;
}

export interface FactoryResponse {
  users: SeamUser[];
  books: SeamBook[];
  checkouts: SeamCheckout[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fail(detail: string): never {
  throw new Error(`Unexpected seam response shape: ${detail}`);
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : fail(`expected number, got ${typeof value}`);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : fail(`expected string, got ${typeof value}`);
}

function parseFactoryResponse(body: unknown): FactoryResponse {
  if (!isRecord(body)) fail("not an object");
  const { users, books, checkouts } = body;
  if (!Array.isArray(users) || !Array.isArray(books) || !Array.isArray(checkouts)) {
    fail("missing users/books/checkouts arrays");
  }

  return {
    users: users.map((entry) => {
      if (!isRecord(entry)) fail("user entry");
      return { id: asNumber(entry.id), email: asString(entry.email) };
    }),
    books: books.map((entry) => {
      if (!isRecord(entry)) fail("book entry");
      return { id: asNumber(entry.id), title: asString(entry.title), isbn: asString(entry.isbn) };
    }),
    checkouts: checkouts.map((entry) => {
      if (!isRecord(entry)) fail("checkout entry");
      return {
        id: asNumber(entry.id),
        user_id: asNumber(entry.user_id),
        book_id: asNumber(entry.book_id),
        checked_out_at: asString(entry.checked_out_at),
        expires_at: asString(entry.expires_at),
        returned_at: entry.returned_at === null ? null : asString(entry.returned_at),
      };
    }),
  };
}

async function seamPost(path: string, body?: unknown, init?: { fetcher?: typeof fetch }): Promise<Response> {
  const doFetch = init?.fetcher ?? fetch;
  const response = await doFetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Seam ${path} failed: ${String(response.status)} ${text}`);
  }
  return response;
}

export async function reset(): Promise<void> {
  await seamPost("/api/test/reset");
}

export async function factory(request: FactoryRequest): Promise<FactoryResponse> {
  const response = await seamPost("/api/test/factory", request);
  return parseFactoryResponse(await response.json());
}

// Establishes a session on the given cookie-jar fetch without bcrypt or the
// login rate limit.
export async function loginAs(userId: number, fetcher: typeof fetch): Promise<void> {
  await seamPost("/api/test/login_as", { user_id: userId }, { fetcher });
}
