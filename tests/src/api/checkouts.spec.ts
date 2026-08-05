import { describe, expect, it } from "vitest";
import { unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

describe("creating checkouts", () => {
  it("checks out a book and returns the contract's checkout envelope", async () => {
    const session = await createSession({ emailPrefix: "borrower" });
    const created = await factory({ books: [{ title: unique("borrowable") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const result = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(result).toMatchApiSchema("/api/checkouts", "post", 201);

    const checkout = result.data?.checkout;
    expect(checkout?.active).toBe(true);
    expect(checkout?.returned_at).toBeNull();
    // The embedded book is the reduced CheckoutBook shape; the schema matcher
    // has already proven no extra fields leak through.
    expect(checkout?.book.id).toBe(book.id);

    // Expiry is one week out.
    if (!checkout) throw new Error("no checkout in response");
    const expiresIn = new Date(checkout.expires_at).getTime() - new Date(checkout.checked_out_at).getTime();
    expect(expiresIn).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("rejects checking out the same book twice while active", async () => {
    const session = await createSession();
    const created = await factory({ books: [{ title: unique("duplicate") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    const second = await session.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(second).toMatchApiSchema("/api/checkouts", "post", 422);
    expect(second.error?.error).toBe("You have already checked out this book");
  });

  it("404s for a nonexistent book id", async () => {
    const session = await createSession();
    const result = await session.client.POST("/api/checkouts", { body: { book_id: 999_999_999 } });
    await expect(result).toMatchApiSchema("/api/checkouts", "post", 404);
  });

  it("counts against the book's availability", async () => {
    const session = await createSession();
    const created = await factory({ books: [{ title: unique("countable") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    await session.client.POST("/api/checkouts", { body: { book_id: book.id } });

    const after = await session.client.GET("/api/books/{id}", { params: { path: { id: book.id } } });
    expect(after.data?.book.active_checkout_count).toBe(1);
    expect(after.data?.book.available).toBe(true);
  });
});
