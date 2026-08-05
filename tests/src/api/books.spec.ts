import { describe, expect, it } from "vitest";
import { unique } from "../helpers/config";
import { factory } from "../helpers/seam";
import { createSession } from "../helpers/session";

// The suite shares one database and resets only once per run, so every
// search asserts within its own unique marker namespace.
describe("books search and show", () => {
  it("searches by title, author, and ISBN with the paginated envelope", async () => {
    const session = await createSession();
    const marker = unique("marker");
    const isbn = `9991${String(Date.now()).slice(-9)}`;
    await factory({
      books: [
        { title: `Alpha ${marker}`, author: "Someone Else" },
        { title: "Unrelated Title", author: `Author ${marker}` },
        { title: "Third Thing", author: "Nobody", isbn },
      ],
    });

    const byTitle = await session.client.GET("/api/books", { params: { query: { query: marker } } });
    await expect(byTitle).toMatchApiSchema("/api/books", "get", 200);
    expect(byTitle.data?.books.map((book) => book.title).sort()).toEqual(
      [`Alpha ${marker}`, "Unrelated Title"].sort(),
    );
    expect(byTitle.data?.pagination.total_count).toBe(2);

    const byIsbn = await session.client.GET("/api/books", { params: { query: { query: isbn } } });
    await expect(byIsbn).toMatchApiSchema("/api/books", "get", 200);
    expect(byIsbn.data?.books.map((book) => book.title)).toEqual(["Third Thing"]);
  });

  it("sorts by title, author, and year (newest first) with deterministic order", async () => {
    const session = await createSession();
    const marker = unique("sortmark");
    await factory({
      books: [
        { title: `${marker} Bravo`, author: `${marker} Yeats`, published_year: 1999 },
        { title: `${marker} Alpha`, author: `${marker} Zola`, published_year: 2021 },
        { title: `${marker} Charlie`, author: `${marker} Adams`, published_year: 2010 },
      ],
    });
    const query = { query: marker };

    const byTitle = await session.client.GET("/api/books", { params: { query: { ...query, sort: "title" as const } } });
    expect(byTitle.data?.books.map((book) => book.title)).toEqual([
      `${marker} Alpha`,
      `${marker} Bravo`,
      `${marker} Charlie`,
    ]);

    const byAuthor = await session.client.GET("/api/books", { params: { query: { ...query, sort: "author" as const } } });
    expect(byAuthor.data?.books.map((book) => book.author)).toEqual([
      `${marker} Adams`,
      `${marker} Yeats`,
      `${marker} Zola`,
    ]);

    const byYear = await session.client.GET("/api/books", { params: { query: { ...query, sort: "year" as const } } });
    expect(byYear.data?.books.map((book) => book.published_year)).toEqual([2021, 2010, 1999]);
  });

  it("available_only hides books at the 5-copy cap", async () => {
    const session = await createSession();
    const marker = unique("avail");
    const created = await factory({
      users: Array.from({ length: 5 }, (_, index) => ({ email: `${marker}-borrower${String(index)}@example.com` })),
      books: [
        { title: `${marker} Saturated` },
        { title: `${marker} Free` },
      ],
    });
    const saturated = created.books[0];
    if (!saturated) throw new Error("factory returned no book");
    await factory({
      checkouts: created.users.map((user) => ({ user_id: user.id, book_id: saturated.id })),
    });

    const all = await session.client.GET("/api/books", { params: { query: { query: marker } } });
    expect(all.data?.pagination.total_count).toBe(2);

    const availableOnly = await session.client.GET("/api/books", {
      params: { query: { query: marker, available_only: "true" } },
    });
    await expect(availableOnly).toMatchApiSchema("/api/books", "get", 200);
    expect(availableOnly.data?.books.map((book) => book.title)).toEqual([`${marker} Free`]);
  });

  it("shows a single book with live availability and 404s on a missing id", async () => {
    const session = await createSession();
    const created = await factory({ books: [{ title: unique("single") }] });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    const found = await session.client.GET("/api/books/{id}", { params: { path: { id: book.id } } });
    await expect(found).toMatchApiSchema("/api/books/{id}", "get", 200);
    expect(found.data?.book).toMatchObject({ id: book.id, available: true, active_checkout_count: 0 });

    const missing = await session.client.GET("/api/books/{id}", { params: { path: { id: 999_999_999 } } });
    await expect(missing).toMatchApiSchema("/api/books/{id}", "get", 404);
  });
});
