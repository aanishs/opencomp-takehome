import { describe, expect, it } from "vitest";
import { unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession, sessionFor } from "../helpers/session";

// Black-box replacement for the old Ruby model-level race test: eight real
// HTTP requests race through Checkout.borrow!'s lock ordering. The book
// starts with zero active checkouts, so exactly 5 must win and 3 must lose.
describe("concurrent borrowing", () => {
  it("never oversubscribes the 5-copy cap under parallel load", async () => {
    const marker = unique("race");
    const created = await factory({
      users: Array.from({ length: 8 }, (_, index) => ({ email: `${marker}-racer${String(index)}@example.com` })),
      books: [{ title: `${marker} Contended Copy` }],
    });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const sessions = await Promise.all(created.users.map((user) => sessionFor(user)));
    const results = await Promise.all(
      sessions.map((session) => session.client.POST("/api/checkouts", { body: { book_id: book.id } })),
    );

    const winners = results.filter((result) => result.response.status === 201);
    const losers = results.filter((result) => result.response.status === 422);
    expect(winners).toHaveLength(5);
    expect(losers).toHaveLength(3);
    for (const loser of losers) {
      expect(loser.error?.error).toBe("This book is currently unavailable");
    }

    // The book is now saturated for everyone.
    const ninth = await createSession({ emailPrefix: "ninth" });
    const after = await ninth.client.POST("/api/checkouts", { body: { book_id: book.id } });
    await expect(after).toMatchApiSchema("/api/checkouts", "post", 422);

    const bookState = await ninth.client.GET("/api/books/{id}", { params: { path: { id: book.id } } });
    expect(bookState.data?.book.active_checkout_count).toBe(5);
    expect(bookState.data?.book.available).toBe(false);
  });
});
