import { expect, test } from "@playwright/test";
import { unique, uniqueEmail } from "../src/helpers/config";
import { factory } from "../src/helpers/seam";

const PASSWORD = "password123";

test.describe("library journeys", () => {
  test("sign up, search, check out, read, and return a book", async ({ page }) => {
    const marker = unique("journey");
    const created = await factory({
      books: [{ title: `${marker} Voyage`, author: "E2E Author", content: `${marker} content begins here. The rest of the page.` }],
    });
    const book = created.books[0];
    if (!book) throw new Error("factory returned no book");

    await page.goto("/");
    await page.getByRole("button", { name: "New here? Create an account" }).click();
    await page.getByLabel("Email").fill(uniqueEmail("e2e-signup"));
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Find your next read.")).toBeVisible();

    await page.getByLabel("Search by title, author, or ISBN").fill(marker);
    const card = page.locator("article.book-card", { hasText: `${marker} Voyage` });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Check out" }).click();
    await expect(card.getByRole("button", { name: "Already checked out" })).toBeVisible();
    await expect(page.getByText("1 of 10 books borrowed")).toBeVisible();

    await page.getByRole("button", { name: "Read", exact: true }).click();
    await expect(page.getByText("Now reading")).toBeVisible();
    await expect(page.getByText(`${marker} content begins here`, { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.getByText("Find your next read.")).toBeVisible();

    await page.getByRole("button", { name: "Return", exact: true }).click();
    await expect(page.getByText("Nothing checked out yet.")).toBeVisible();
    await expect(page.getByText("0 of 10 books borrowed")).toBeVisible();
  });

  test("the 10-book limit surfaces the server's message in the UI", async ({ page }) => {
    const marker = unique("limitful");
    const created = await factory({
      users: [{ email: uniqueEmail("e2e-maxed") }],
      books: Array.from({ length: 11 }, (_, index) => ({ title: `${marker} ${String(index)}` })),
    });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");
    const eleventh = created.books[10];
    if (!eleventh) throw new Error("missing 11th book");
    await factory({
      checkouts: created.books.slice(0, 10).map((book) => ({ user_id: user.id, book_id: book.id })),
    });

    await page.goto("/");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("10 of 10 books borrowed")).toBeVisible();

    await page.getByLabel("Search by title, author, or ISBN").fill(marker);
    const card = page.locator("article.book-card", { hasText: eleventh.title });
    await card.getByRole("button", { name: "Check out" }).click();

    await expect(page.getByText("You can only check out 10 books at a time")).toBeVisible();
  });

  test("sessions persist across reloads and end on sign-out", async ({ page }) => {
    const created = await factory({ users: [{ email: uniqueEmail("e2e-session") }] });
    const user = created.users[0];
    if (!user) throw new Error("factory returned no user");

    await page.goto("/");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(`Signed in as ${user.email}.`)).toBeVisible();

    await page.reload();
    await expect(page.getByText(`Signed in as ${user.email}.`)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Welcome back")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Welcome back")).toBeVisible();
  });
});
