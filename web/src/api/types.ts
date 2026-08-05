// Interim hand-written API types + shape parsers for the C1 TypeScript
// conversion. C3 replaces these with types generated from openapi.yaml;
// only the shapes the UI consumes are checked here.

export interface User {
  id: number;
  email: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  description: string | null;
  published_year: number | null;
  active_checkout_count: number;
  available: boolean;
}

export interface CheckoutBook {
  id: number;
  title: string;
  author: string;
  isbn: string;
  available: boolean;
}

export interface Checkout {
  id: number;
  checked_out_at: string;
  expires_at: string;
  returned_at: string | null;
  active: boolean;
  book: CheckoutBook;
}

export interface Pagination {
  page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fail(): never {
  throw new Error("Unexpected response shape from the API");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : fail();
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : fail();
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : fail();
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

function parseUser(value: unknown): User {
  if (!isRecord(value)) fail();
  return { id: asNumber(value.id), email: asString(value.email) };
}

function parseBook(value: unknown): Book {
  if (!isRecord(value)) fail();
  return {
    id: asNumber(value.id),
    title: asString(value.title),
    author: asString(value.author),
    isbn: asString(value.isbn),
    description: asNullableString(value.description),
    published_year: asNullableNumber(value.published_year),
    active_checkout_count: asNumber(value.active_checkout_count),
    available: asBoolean(value.available),
  };
}

function parseCheckoutBook(value: unknown): CheckoutBook {
  if (!isRecord(value)) fail();
  return {
    id: asNumber(value.id),
    title: asString(value.title),
    author: asString(value.author),
    isbn: asString(value.isbn),
    available: asBoolean(value.available),
  };
}

function parseCheckout(value: unknown): Checkout {
  if (!isRecord(value)) fail();
  return {
    id: asNumber(value.id),
    checked_out_at: asString(value.checked_out_at),
    expires_at: asString(value.expires_at),
    returned_at: asNullableString(value.returned_at),
    active: asBoolean(value.active),
    book: parseCheckoutBook(value.book),
  };
}

function parsePagination(value: unknown): Pagination {
  if (!isRecord(value)) fail();
  return {
    page: asNumber(value.page),
    per_page: asNumber(value.per_page),
    total_pages: asNumber(value.total_pages),
    total_count: asNumber(value.total_count),
  };
}

export function parseUserResponse(body: unknown): { user: User } {
  if (!isRecord(body)) fail();
  return { user: parseUser(body.user) };
}

export function parseCsrfResponse(body: unknown): { csrf_token: string } {
  if (!isRecord(body)) fail();
  return { csrf_token: asString(body.csrf_token) };
}

export function parseBooksResponse(body: unknown): { books: Book[]; pagination: Pagination } {
  if (!isRecord(body) || !Array.isArray(body.books)) fail();
  return {
    books: body.books.map(parseBook),
    pagination: parsePagination(body.pagination),
  };
}

export function parseBookResponse(body: unknown): { book: Book } {
  if (!isRecord(body)) fail();
  return { book: parseBook(body.book) };
}

export function parseCheckoutsResponse(body: unknown): { checkouts: Checkout[] } {
  if (!isRecord(body) || !Array.isArray(body.checkouts)) fail();
  return { checkouts: body.checkouts.map(parseCheckout) };
}

export function parseCheckoutResponse(body: unknown): { checkout: Checkout } {
  if (!isRecord(body)) fail();
  return { checkout: parseCheckout(body.checkout) };
}
