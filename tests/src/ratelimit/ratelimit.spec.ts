import { afterAll, describe, expect, it } from "vitest";
import { uniqueEmail } from "../helpers/config";
import { factory, reset } from "../helpers/seam";
import { createGuestSession } from "../helpers/session";

// Runs as its own serial Vitest project, after the main api project: the
// limit is per-IP, so exercising it here would 429 any spec running at the
// same time. reset() afterwards clears the rate-limiter cache for the next
// run (and for `rails test` against the same server).
describe("login rate limiting", () => {
  afterAll(async () => {
    await reset();
  });

  it("returns 429 with the documented shape after 10 attempts in 3 minutes", async () => {
    const created = await factory({ users: [{ email: uniqueEmail("throttled") }] });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");

    const guest = createGuestSession();
    const csrf = await guest.client.GET("/api/csrf");
    guest.setCsrfToken(csrf.data?.csrf_token ?? null);

    let sawTooMany = false;
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      const result = await guest.client.POST("/api/auth/login", {
        body: { email: user.email, password: "wrong-password" },
      });
      if (result.response.status === 429) {
        await expect(result).toMatchApiSchema("/api/auth/login", "post", 429);
        expect(result.error?.error).toContain("Too many attempts");
        expect(attempt).toBeGreaterThan(10);
        sawTooMany = true;
        break;
      }
      await expect(result).toMatchApiSchema("/api/auth/login", "post", 401);
    }

    expect(sawTooMany).toBe(true);
  });
});
