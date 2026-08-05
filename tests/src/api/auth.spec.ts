import { describe, expect, it } from "vitest";
import { uniqueEmail } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createGuestSession, createSession, DEFAULT_PASSWORD, sessionFor } from "../helpers/session";

// Real sign-up/login are rate-limited at 10/3min per IP; this file spends a
// small, bounded number of them. Everything else in the suite authenticates
// through the seam.
describe("authentication", () => {
  it("signs up a new account and starts a session", async () => {
    const guest = createGuestSession();
    const csrf = await guest.client.GET("/api/csrf");
    await expect(csrf).toMatchApiSchema("/api/csrf", "get", 200);
    guest.setCsrfToken(csrf.data?.csrf_token ?? null);

    const email = uniqueEmail("signup");
    const result = await guest.client.POST("/api/auth/sign_up", {
      body: { user: { email, password: "password123", password_confirmation: "password123" } },
    });
    await expect(result).toMatchApiSchema("/api/auth/sign_up", "post", 201);
    expect(result.data?.user.email).toBe(email);

    const me = await guest.client.GET("/api/me");
    await expect(me).toMatchApiSchema("/api/me", "get", 200);
    expect(me.data?.user.email).toBe(email);
  });

  it("rejects a sign-up with mismatched password confirmation using the errors-list shape", async () => {
    const guest = createGuestSession();
    const csrf = await guest.client.GET("/api/csrf");
    guest.setCsrfToken(csrf.data?.csrf_token ?? null);

    const result = await guest.client.POST("/api/auth/sign_up", {
      body: {
        user: {
          email: uniqueEmail("mismatch"),
          password: "password123",
          password_confirmation: "different-thing",
        },
      },
    });
    await expect(result).toMatchApiSchema("/api/auth/sign_up", "post", 422);
  });

  it("logs in with valid credentials and rejects bad ones", async () => {
    const created = await factory({ users: [{ email: uniqueEmail("login") }] });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");

    const guest = createGuestSession();
    const csrf = await guest.client.GET("/api/csrf");
    guest.setCsrfToken(csrf.data?.csrf_token ?? null);

    const bad = await guest.client.POST("/api/auth/login", {
      body: { email: user.email, password: "wrong-password" },
    });
    await expect(bad).toMatchApiSchema("/api/auth/login", "post", 401);

    const good = await guest.client.POST("/api/auth/login", {
      body: { email: user.email, password: DEFAULT_PASSWORD },
    });
    await expect(good).toMatchApiSchema("/api/auth/login", "post", 200);
    expect(good.data?.user.email).toBe(user.email);
  });

  it("logs out and the session stops authenticating", async () => {
    const session = await createSession({ emailPrefix: "logout" });

    const result = await session.client.DELETE("/api/auth/logout");
    await expect(result).toMatchApiSchema("/api/auth/logout", "delete", 204);

    const me = await session.client.GET("/api/me");
    await expect(me).toMatchApiSchema("/api/me", "get", 401);
  });

  it("requires authentication for the library surface", async () => {
    const guest = createGuestSession();

    const books = await guest.client.GET("/api/books");
    await expect(books).toMatchApiSchema("/api/books", "get", 401);

    const checkouts = await guest.client.GET("/api/checkouts");
    await expect(checkouts).toMatchApiSchema("/api/checkouts", "get", 401);
  });

  it("session survives across requests via the cookie jar", async () => {
    const created = await factory({ users: [{ email: uniqueEmail("persist") }] });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");

    const session = await sessionFor(user);
    const first = await session.client.GET("/api/me");
    const second = await session.client.GET("/api/me");
    await expect(first).toMatchApiSchema("/api/me", "get", 200);
    await expect(second).toMatchApiSchema("/api/me", "get", 200);
  });
});
