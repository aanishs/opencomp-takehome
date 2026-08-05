import { describe, expect, it } from "vitest";
import { unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

describe("reading a book", () => {
  it("returns plain-text content only while the reader holds an active checkout", async () => {
    const session = await createSession({ emailPrefix: "reader" });
    const content = `Reader content ${unique("body")}\n\nA full page of it.`;
    const created = await factory({ books: [{ title: unique("readable"), content }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const before = await session.client.GET("/api/books/{id}/read", {
      params: { path: { id: book.id } },
      parseAs: "text",
    });
    // openapi-fetch parses the JSON error body when the response is not ok.
    expect(before.response.status).toBe(403);

    const checkout = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(checkout).toMatchApiSchema("/api/checkouts", "post", 201);

    const after = await session.client.GET("/api/books/{id}/read", {
      params: { path: { id: book.id } },
      parseAs: "text",
    });
    await expect(after).toMatchApiSchema("/api/books/{id}/read", "get", 200);
    expect(after.data).toBe(content);
  });

  it("does not leak content through another user's checkout", async () => {
    const owner = await createSession({ emailPrefix: "owner" });
    const other = await createSession({ emailPrefix: "other" });
    const created = await factory({ books: [{ title: unique("private") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    await owner.client.POST("/api/checkouts", { body: { book_id: book.id } });

    const stolen = await other.client.GET("/api/books/{id}/read", {
      params: { path: { id: book.id } },
      parseAs: "text",
    });
    expect(stolen.response.status).toBe(403);
  });

  it("404s for a missing book id", async () => {
    const session = await createSession();
    const missing = await session.client.GET("/api/books/{id}/read", {
      params: { path: { id: 999_999_999 } },
      parseAs: "text",
    });
    expect(missing.response.status).toBe(404);
  });
});
