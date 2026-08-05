// Session factory: a cookie-jar-wrapped native fetch plus a typed
// openapi-fetch client, so every test request is checked against the
// generated contract types at compile time.
import makeFetchCookie from "fetch-cookie";
import createClient from "openapi-fetch";
import type { Client, Middleware } from "openapi-fetch";
import type { paths } from "../../../openapi/generated/schema";
import { BASE_URL, uniqueEmail } from "./config";
import { factory, loginAs } from "./seam";
import type { SeamUser } from "./seam";

export type ApiClient = Client<paths>;

export interface Session {
  client: ApiClient;
  fetch: typeof fetch;
  user: SeamUser;
  csrfToken: string;
}

export const DEFAULT_PASSWORD = "password123";

function buildClient(fetcher: typeof fetch, getCsrfToken: () => string | null): ApiClient {
  const client = createClient<paths>({ baseUrl: BASE_URL, fetch: fetcher });
  const middleware: Middleware = {
    onRequest({ request }) {
      const token = getCsrfToken();
      if (token && request.method !== "GET" && request.method !== "HEAD") {
        request.headers.set("X-CSRF-Token", token);
      }
      return request;
    },
  };
  client.use(middleware);
  return client;
}

// A client with a cookie jar but no session — for exercising 401s and the
// auth endpoints themselves.
export function createGuestSession(): { client: ApiClient; fetch: typeof fetch; setCsrfToken: (token: string | null) => void } {
  const fetcher = makeFetchCookie(fetch);
  let csrfToken: string | null = null;
  const client = buildClient(fetcher, () => csrfToken);
  return {
    client,
    fetch: fetcher,
    setCsrfToken: (token) => {
      csrfToken = token;
    },
  };
}

async function fetchCsrfToken(client: ApiClient): Promise<string> {
  const result = await client.GET("/api/csrf");
  if (!result.data) {
    throw new Error(`Could not fetch CSRF token: ${String(result.response.status)}`);
  }
  return result.data.csrf_token;
}

// A fully authenticated session for a fresh user (created via the seam, so
// no rate-limit budget is consumed).
export async function createSession(options?: { emailPrefix?: string }): Promise<Session> {
  const created = await factory({
    users: [{ email: uniqueEmail(options?.emailPrefix ?? "reader") }],
  });
  const user = created.users[0];
  if (!user) throw new Error("Factory did not return a user");
  return sessionFor(user);
}

// A session for an existing seam-created user.
export async function sessionFor(user: SeamUser): Promise<Session> {
  const fetcher = makeFetchCookie(fetch);
  await loginAs(user.id, fetcher);

  let csrfToken: string | null = null;
  const client = buildClient(fetcher, () => csrfToken);
  csrfToken = await fetchCsrfToken(client);

  return { client, fetch: fetcher, user, csrfToken };
}
