// The one place the app talks HTTP. `paths` is generated from
// openapi/openapi.yaml, so every route, request body, query param, and
// response shape below is checked against the contract at compile time.
import createClient from "openapi-fetch";
import type { Middleware } from "openapi-fetch";
import type { paths } from "../../../openapi/generated/schema";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The contract has two error shapes: {error: string} everywhere, and
// {errors: string[]} for registration validation failures.
export function errorMessage(body: unknown): string {
  if (isRecord(body)) {
    if (Array.isArray(body.errors)) {
      const messages = body.errors.filter((entry): entry is string => typeof entry === "string");
      if (messages.length > 0) return messages.join(", ");
    }
    if (typeof body.error === "string" && body.error) return body.error;
  }
  return "Something went wrong";
}

// App registers a handler so a 401 from any authenticated request drops the
// user back to the sign-in screen instead of stranding them in the app.
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// The current CSRF token is mirrored here from App state so the middleware
// can attach it to every mutating request.
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const middleware: Middleware = {
  onRequest({ request }) {
    if (csrfToken && MUTATING_METHODS.has(request.method)) {
      request.headers.set("X-CSRF-Token", csrfToken);
    }
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401 && onUnauthorized) onUnauthorized();
    return response;
  },
};

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  credentials: "include",
});
api.use(middleware);

// openapi-fetch reports errors as data; the app's flow is throw-based, so
// unwrap converts a contract error (or empty success) into an ApiError.
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw new ApiError(errorMessage(result.error), result.response.status);
}
