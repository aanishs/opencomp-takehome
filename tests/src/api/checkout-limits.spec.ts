import { describe, expect, it } from "vitest";
import { unique, uniqueEmail } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession, sessionFor } from "../helpers/session";

const PAST = "2026-01-01T00:00:00Z";

describe("checkout limits", () => {
  it("caps a user at 10 active checkouts", async () => {
    const session = await createSession({ emailPrefix: "maxed" });
    const created = await factory({
      books: Array.from({ length: 11 }, (_, index) => ({ title: `${unique("limit")} ${String(index)}` })),
    });
    const bookIds = created.books.map((book) => book.id);
    await factory({
      checkouts: bookIds.slice(0, 10).map((bookId) => ({ user_id: session.user.id, book_id: bookId })),
    });

    const eleventhBook = bookIds[10];
    if (eleventhBook === undefined) throw new Error("missing 11th book");
    const eleventh = await session.client.POST("/api/checkouts", { body: { book_id: eleventhBook } });
    await expect(eleventh).toMatchApiSchema("/api/checkouts", "post", 422);
    expect(eleventh.error?.error).toBe("You can only check out 10 books at a time");
  });

  it("caps a book at 5 active checkouts", async () => {
    const marker = unique("bookcap");
    const created = await factory({
      users: Array.from({ length: 5 }, (_, index) => ({ email: `${marker}-u${String(index)}@example.com` })),
      books: [{ title: `${marker} Contended` }],
    });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");
    await factory({
      checkouts: created.users.map((user) => ({ user_id: user.id, book_id: book.id })),
    });

    const sixth = await createSession({ emailPrefix: "sixth" });
    const result = await sixth.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(result).toMatchApiSchema("/api/checkouts", "post", 422);
    expect(result.error?.error).toBe("This book is currently unavailable");
  });

  it("expired checkouts consume neither limit", async () => {
    const created = await factory({
      users: [{ email: uniqueEmail("expired") }],
      books: Array.from({ length: 11 }, (_, index) => ({ title: `${unique("expired")} ${String(index)}` })),
    });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");
    const bookIds = created.books.map((book) => book.id);

    // 10 checkouts, all expired in the past: the user's active count is 0.
    await factory({
      checkouts: bookIds.slice(0, 10).map((bookId) => ({
        user_id: user.id,
        book_id: bookId,
        checked_out_at: "2025-12-25T00:00:00Z",
        expires_at: PAST,
      })),
    });

    const session = await sessionFor(user);
    const eleventhBook = bookIds[10];
    if (eleventhBook === undefined) throw new Error("missing 11th book");
    const result = await session.client.POST("/api/checkouts", { body: { book_id: eleventhBook } });
    await expect(result).toMatchApiSchema("/api/checkouts", "post", 201);
  });

  it("a saturated book frees a copy when one expires", async () => {
    const marker = unique("expiry-frees");
    const created = await factory({
      users: Array.from({ length: 5 }, (_, index) => ({ email: `${marker}-u${String(index)}@example.com` })),
      books: [{ title: `${marker} Book` }],
    });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");
    const users = created.users;

    // 4 active + 1 expired = only 4 count against the cap.
    await factory({
      checkouts: users.map((user, index) => ({
        user_id: user.id,
        book_id: book.id,
        ...(index === 0 ? { checked_out_at: "2025-12-25T00:00:00Z", expires_at: PAST } : {}),
      })),
    });

    const session = await createSession({ emailPrefix: "claims-freed-copy" });
    const result = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(result).toMatchApiSchema("/api/checkouts", "post", 201);
  });
});
