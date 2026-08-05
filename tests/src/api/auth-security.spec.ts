import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { describe, expect, it } from "vitest";
import { BASE_URL, uniqueEmail } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createGuestSession, createSession, DEFAULT_PASSWORD } from "../helpers/session";

const SESSION_COOKIE = "_online_library_session";

async function sessionCookieValue(jar: CookieJar): Promise<string | undefined> {
  const cookies = await jar.getCookies(BASE_URL);
  return cookies.find((cookie) => cookie.key === SESSION_COOKIE)?.value;
}

// The old Ruby suite also asserted bcrypt timing equalization for unknown
// emails; that is not observably testable over HTTP (network jitter dwarfs
// it), so it is deliberately not replicated here. The login rate limit lives
// in the serial "ratelimit" project.
describe("session security", () => {
  it("rotates the session cookie on login (no session fixation)", async () => {
    const created = await factory({ users: [{ email: uniqueEmail("fixation") }] });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");

    const jar = new CookieJar();
    const fetcher = makeFetchCookie(fetch, jar);

    // Pre-login: touching the API issues an anonymous session cookie.
    const csrfResponse = await fetcher(`${BASE_URL}/api/csrf`);
    const csrfBody: unknown = await csrfResponse.json();
    const preLogin = await sessionCookieValue(jar);
    expect(preLogin).toBeDefined();

    const token =
      typeof csrfBody === "object" && csrfBody !== null && "csrf_token" in csrfBody && typeof csrfBody.csrf_token === "string"
        ? csrfBody.csrf_token
        : "";
    const login = await fetcher(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({ email: user.email, password: DEFAULT_PASSWORD }),
    });
    expect(login.status).toBe(200);

    const postLogin = await sessionCookieValue(jar);
    expect(postLogin).toBeDefined();
    expect(postLogin).not.toBe(preLogin);
  });

  it("invalidates the CSRF token when the session rotates", async () => {
    const session = await createSession({ emailPrefix: "stale-token" });
    const staleToken = session.csrfToken;

    // Logging out resets the session, which orphans the old token.
    await session.client.DELETE("/api/auth/logout");

    const response = await session.fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": staleToken },
      body: JSON.stringify({ email: session.user.email, password: DEFAULT_PASSWORD }),
    });
    const body: unknown = await response.json();
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: "Invalid CSRF token" });
  });

  it("does not reveal whether an email exists", async () => {
    const guest = createGuestSession();
    const csrf = await guest.client.GET("/api/csrf");
    guest.setCsrfToken(csrf.data?.csrf_token ?? null);

    const unknownEmail = await guest.client.POST("/api/auth/login", {
      body: { email: uniqueEmail("never-registered"), password: "password123" },
    });
    await expect(unknownEmail).toMatchApiSchema("/api/auth/login", "post", 401);
    expect(unknownEmail.error?.error).toBe("Invalid email or password");
  });
});
