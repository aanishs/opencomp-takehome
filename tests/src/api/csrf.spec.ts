import { describe, expect, it } from "vitest";
import { BASE_URL, unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

describe("CSRF protection", () => {
  it("rejects a mutating request without a token", async () => {
    const session = await createSession({ emailPrefix: "csrf-less" });
    const created = await factory({ books: [{ title: unique("csrf-book") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    // Raw fetch on the session's cookie jar, deliberately omitting the header
    // the typed client would inject.
    const response = await session.fetch(`${BASE_URL}/api/checkouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: book.id }),
    });
    const body: unknown = await response.json();
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: "Invalid CSRF token" });
  });

  it("rejects a garbage token", async () => {
    const session = await createSession();
    const response = await session.fetch(`${BASE_URL}/api/auth/logout`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": "forged-token" },
    });
    expect(response.status).toBe(422);
  });

  it("accepts the token issued for the session", async () => {
    const session = await createSession();
    const created = await factory({ books: [{ title: unique("csrf-ok") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const result = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(result).toMatchApiSchema("/api/checkouts", "post", 201);
  });
});
