import { useEffect, useMemo, useRef, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function responseBody(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.errors?.join(", ") || body.error || "Something went wrong");
  }

  return body;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

const READER_PAGE_CHARS = 1800;
const READER_FONT_SIZES = { small: "1rem", medium: "1.15rem", large: "1.35rem" };

// Split on word boundaries near the target page size so pages never cut a
// word in half; falls back to a hard cut for pathological unbroken text.
function paginateText(text) {
  const pages = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + READER_PAGE_CHARS, text.length);
    if (end < text.length) {
      const breakAt = Math.max(text.lastIndexOf(" ", end), text.lastIndexOf("\n", end));
      if (breakAt > start) end = breakAt;
    }
    pages.push(text.slice(start, end).trimStart());
    start = end;
  }

  return pages.length ? pages : [""];
}

function ReaderPage({ onSignOut }) {
  const bookId = window.location.pathname.split("/").at(-1);
  const storageKey = `reader-position-${bookId}`;
  const [book, setBook] = useState(null);
  const [bookContent, setBookContent] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [fontSize, setFontSize] = useState("medium");
  const [error, setError] = useState("");

  const pages = useMemo(() => paginateText(bookContent || ""), [bookContent]);

  useEffect(() => {
    async function loadBook() {
      try {
        const [bookResponse, contentResponse] = await Promise.all([
          fetch(`${apiUrl}/api/books/${bookId}`, { credentials: "include" }),
          fetch(`${apiUrl}/api/books/${bookId}/read`, { credentials: "include" }),
        ]);
        const bookBody = await responseBody(bookResponse);
        if (!contentResponse.ok) await responseBody(contentResponse);

        const content = await contentResponse.text();
        setBook(bookBody.book);

        // Restore the saved position, clamped so a stale or corrupt entry
        // (edited content, cleared pages) can never point past the end.
        let saved = {};
        try {
          saved = JSON.parse(localStorage.getItem(storageKey)) || {};
        } catch {
          saved = {};
        }
        const pageCount = paginateText(content).length;
        const savedPage = Number.isInteger(saved.page) ? saved.page : 0;
        setPageIndex(Math.min(Math.max(savedPage, 0), pageCount - 1));
        if (saved.fontSize in READER_FONT_SIZES) setFontSize(saved.fontSize);
        setBookContent(content);
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    loadBook();
  }, [bookId, storageKey]);

  useEffect(() => {
    if (bookContent === null) return;
    localStorage.setItem(storageKey, JSON.stringify({ page: pageIndex, fontSize }));
  }, [pageIndex, fontSize, bookContent, storageKey]);

  useEffect(() => {
    function turnPage(event) {
      if (event.key === "ArrowLeft") setPageIndex((current) => Math.max(current - 1, 0));
      if (event.key === "ArrowRight") setPageIndex((current) => Math.min(current + 1, pages.length - 1));
    }

    window.addEventListener("keydown", turnPage);
    return () => window.removeEventListener("keydown", turnPage);
  }, [pages.length]);

  const percentComplete = Math.round(((pageIndex + 1) / pages.length) * 100);

  return (
    <main className="reader-page">
      <header className="reader-header">
        <button
          className="secondary"
          onClick={() => window.location.assign(sessionStorage.getItem("libraryReturnUrl") || "/")}
        >
          Back to library
        </button>
        <div className="font-controls" role="group" aria-label="Font size">
          {Object.keys(READER_FONT_SIZES).map((size) => (
            <button
              key={size}
              className={size === fontSize ? "" : "secondary"}
              onClick={() => setFontSize(size)}
            >
              {size === "small" ? "A" : size === "medium" ? "A+" : "A++"}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      {error && <p className="error">{error}</p>}
      {!error && bookContent === null && <p>Loading book…</p>}
      {book && bookContent !== null && (
        <article className="reader-content">
          <p className="eyebrow">Now reading</p>
          <h1>{book.title}</h1>
          <p className="author">{book.author}</p>
          <div style={{ fontSize: READER_FONT_SIZES[fontSize] }}>{pages[pageIndex]}</div>
          <nav className="reader-nav" aria-label="Reader pagination">
            <button
              className="secondary"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex(pageIndex - 1)}
            >
              Previous
            </button>
            <span>Page {pageIndex + 1} of {pages.length} · {percentComplete}%</span>
            <button
              className="secondary"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => setPageIndex(pageIndex + 1)}
            >
              Next
            </button>
          </nav>
        </article>
      )}
    </main>
  );
}

function libraryUrlState() {
  const params = new URLSearchParams(window.location.search);
  const page = parseInt(params.get("page"), 10);

  return {
    query: params.get("query") || "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: ["title", "author", "year"].includes(params.get("sort")) ? params.get("sort") : "title",
    availableOnly: params.get("available_only") === "true",
  };
}

function Library({ user, csrfToken, onSignOut }) {
  const initial = libraryUrlState();
  const [books, setBooks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [checkouts, setCheckouts] = useState([]);
  const [query, setQuery] = useState(initial.query);
  const [page, setPage] = useState(initial.page);
  const [sort, setSort] = useState(initial.sort);
  const [availableOnly, setAvailableOnly] = useState(initial.availableOnly);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState(null);
  const [returningId, setReturningId] = useState(null);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);

  useEffect(() => {
    loadCheckouts();
  }, []);

  // Debounced book loading. The generation counter discards responses that
  // resolve out of order, so a slow older query can never overwrite a newer one.
  useEffect(() => {
    const generation = ++requestGeneration.current;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query, page, sort });
        if (availableOnly) params.set("available_only", "true");
        const body = await responseBody(
          await fetch(`${apiUrl}/api/books?${params}`, { credentials: "include" }),
        );
        if (requestGeneration.current !== generation) return;
        setBooks(body.books);
        setPagination(body.pagination);
        setError("");
      } catch (loadError) {
        if (requestGeneration.current === generation) setError(loadError.message);
      } finally {
        if (requestGeneration.current === generation) setLoadingBooks(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, page, sort, availableOnly]);

  // Mirror search state into the URL so reload, back, and the reader
  // round-trip land on the same view.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (page > 1) params.set("page", String(page));
    if (sort !== "title") params.set("sort", sort);
    if (availableOnly) params.set("available_only", "true");
    const target = params.size ? `/?${params}` : "/";
    const current = window.location.pathname + window.location.search;
    if (current !== target) window.history.replaceState(null, "", target);
  }, [query, page, sort, availableOnly]);

  useEffect(() => {
    function restoreFromUrl() {
      const state = libraryUrlState();
      setQuery(state.query);
      setPage(state.page);
      setSort(state.sort);
      setAvailableOnly(state.availableOnly);
    }

    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, []);

  async function loadCheckouts() {
    try {
      const body = await responseBody(
        await fetch(`${apiUrl}/api/checkouts`, { credentials: "include" }),
      );
      setCheckouts(body.checkouts);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  function updateSearch(changes) {
    if (changes.query !== undefined) setQuery(changes.query);
    if (changes.sort !== undefined) setSort(changes.sort);
    if (changes.availableOnly !== undefined) setAvailableOnly(changes.availableOnly);
    setPage(changes.page ?? 1);
  }

  async function checkOut(book) {
    setError("");
    setCheckingOutId(book.id);

    try {
      const result = await responseBody(
        await fetch(`${apiUrl}/api/checkouts`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ book_id: book.id }),
        }),
      );
      setCheckouts((current) => [...current, result.checkout]);
      setBooks((current) => current.map((currentBook) => (
        currentBook.id === book.id
          ? { ...currentBook, active_checkout_count: currentBook.active_checkout_count + 1, available: currentBook.active_checkout_count + 1 < 5 }
          : currentBook
      )));
    } catch (checkoutError) {
      setError(checkoutError.message);
    } finally {
      setCheckingOutId(null);
    }
  }

  async function returnBook(checkout) {
    setError("");
    setReturningId(checkout.id);

    try {
      const result = await responseBody(
        await fetch(`${apiUrl}/api/checkouts/${checkout.id}/return`, {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": csrfToken },
        }),
      );
      setCheckouts((current) => current.map((existing) => (
        existing.id === checkout.id ? result.checkout : existing
      )));
      setBooks((current) => current.map((book) => (
        book.id === checkout.book.id
          ? { ...book, active_checkout_count: Math.max(0, book.active_checkout_count - 1), available: true }
          : book
      )));
    } catch (returnError) {
      setError(returnError.message);
    } finally {
      setReturningId(null);
    }
  }

  function readBook(checkout) {
    sessionStorage.setItem("libraryReturnUrl", window.location.pathname + window.location.search);
    window.location.assign(`/read/${checkout.book.id}`);
  }

  const activeCheckoutIds = new Set(checkouts.filter((checkout) => checkout.active).map((checkout) => checkout.book.id));
  const activeCheckouts = checkouts.filter((checkout) => checkout.active);
  const historyCheckouts = checkouts
    .filter((checkout) => !checkout.active)
    .sort((a, b) => new Date(b.returned_at || b.expires_at) - new Date(a.returned_at || a.expires_at));
  const atUserLimit = activeCheckouts.length >= 10;

  function historyAction(checkout) {
    if (activeCheckoutIds.has(checkout.book.id)) return { label: "Borrowed", disabled: true };
    if (!checkout.book.available) return { label: "Unavailable", disabled: true };
    if (atUserLimit) return { label: "Limit reached", disabled: true };
    return { label: checkingOutId === checkout.book.id ? "Checking out…" : "Check out again", disabled: checkingOutId === checkout.book.id };
  }

  return (
    <main className="library-shell">
      <header className="library-header">
        <div>
          <p className="eyebrow">Online library</p>
          <h1>Find your next read.</h1>
          <p>Signed in as {user.email}.</p>
        </div>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>

      <section className="library-layout">
        <div>
          <form className="search-form" onSubmit={(event) => event.preventDefault()}>
            <input
              aria-label="Search by title, author, or ISBN"
              value={query}
              onChange={(event) => updateSearch({ query: event.target.value })}
              placeholder="Search title, author, or ISBN"
            />
            <select
              aria-label="Sort books"
              value={sort}
              onChange={(event) => updateSearch({ sort: event.target.value })}
            >
              <option value="title">Sort by title</option>
              <option value="author">Sort by author</option>
              <option value="year">Newest first</option>
            </select>
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => updateSearch({ availableOnly: event.target.checked })}
              />
              Available now
            </label>
          </form>

          {error && <p className="error" aria-live="polite">{error}</p>}
          {pagination && (
            <p className="result-count" aria-live="polite">
              {pagination.total_count.toLocaleString()} {pagination.total_count === 1 ? "book" : "books"}
              {loadingBooks && " — updating…"}
            </p>
          )}
          {loadingBooks && !pagination ? <p>Loading books…</p> : (
            <div className="book-grid">
              {books.map((book) => {
                const alreadyCheckedOut = activeCheckoutIds.has(book.id);
                const unavailable = !book.available || alreadyCheckedOut;

                return (
                  <article className="book-card" key={book.id}>
                    <p className="book-meta">{book.published_year || "Year unknown"}</p>
                    <h2>{book.title}</h2>
                    <p className="author">{book.author}</p>
                    {book.description && <p>{book.description}</p>}
                    <p className={book.available ? "availability" : "availability unavailable"}>
                      {book.available ? `${5 - book.active_checkout_count} copies available` : "All copies checked out"}
                    </p>
                    <button disabled={unavailable || checkingOutId === book.id} onClick={() => checkOut(book)}>
                      {checkingOutId === book.id ? "Checking out…" : alreadyCheckedOut ? "Already checked out" : book.available ? "Check out" : "Unavailable"}
                    </button>
                  </article>
                );
              })}
              {!books.length && <p>No books matched your search.</p>}
            </div>
          )}
          {pagination && pagination.total_pages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {Math.min(page, pagination.total_pages)} of {pagination.total_pages}</span>
              <button
                className="secondary"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </div>

        <aside className="checkout-panel">
          <p className="eyebrow">Your checkouts</p>
          <h2>{activeCheckouts.length} of 10 books borrowed</h2>
          {activeCheckouts.length ? (
            <ul>
              {activeCheckouts.map((checkout) => (
                <li key={checkout.id}>
                  <strong>{checkout.book.title}</strong>
                  <span>Due {formatDate(checkout.expires_at)}</span>
                  <button className="read-button" onClick={() => readBook(checkout)}>Read</button>
                  <button
                    className="secondary"
                    disabled={returningId === checkout.id}
                    onClick={() => returnBook(checkout)}
                  >
                    {returningId === checkout.id ? "Returning…" : "Return"}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p>Nothing checked out yet.</p>}

          {historyCheckouts.length > 0 && (
            <div className="history-section">
              <p className="eyebrow">History</p>
              <ul>
                {historyCheckouts.map((checkout) => {
                  const action = historyAction(checkout);

                  return (
                    <li key={checkout.id}>
                      <strong>{checkout.book.title}</strong>
                      <span>Borrowed {formatDate(checkout.checked_out_at)}</span>
                      <span>
                        {checkout.returned_at
                          ? `Returned ${formatDate(checkout.returned_at)}`
                          : `Expired ${formatDate(checkout.expires_at)}`}
                      </span>
                      <button
                        className="read-button secondary"
                        disabled={action.disabled}
                        onClick={() => checkOut(checkout.book)}
                      >
                        {action.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </section>

    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("signIn");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const csrf = await responseBody(
          await fetch(`${apiUrl}/api/csrf`, { credentials: "include" }),
        );
        setCsrfToken(csrf.csrf_token);

        const session = await fetch(`${apiUrl}/api/me`, { credentials: "include" });
        if (session.ok) setUser((await session.json()).user);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setSubmitting(true);

    const form = new FormData(formElement);
    const signingUp = mode === "signUp";
    const payload = signingUp
      ? {
          user: {
            email: form.get("email"),
            password: form.get("password"),
            password_confirmation: form.get("passwordConfirmation"),
          },
        }
      : { email: form.get("email"), password: form.get("password") };

    try {
      const result = await responseBody(
        await fetch(`${apiUrl}/api/auth/${signingUp ? "sign_up" : "login"}`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(payload),
        }),
      );
      setUser(result.user);
      formElement.reset();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setError("");

    try {
      const response = await fetch(`${apiUrl}/api/auth/logout`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) await responseBody(response);
      setUser(null);
    } catch (signOutError) {
      setError(signOutError.message);
    }
  }

  if (loading) {
    return <main className="shell">Loading library…</main>;
  }

  if (user) {
    if (window.location.pathname.startsWith("/read/")) {
      return <ReaderPage onSignOut={signOut} />;
    }

    return <Library user={user} csrfToken={csrfToken} onSignOut={signOut} />;
  }

  const signingUp = mode === "signUp";

  return (
    <main className="shell">
      <p className="eyebrow">Online library</p>
      <h1>{signingUp ? "Create your account" : "Welcome back"}</h1>
      <p className="intro">
        {signingUp ? "Start borrowing books from the library." : "Sign in to browse the library."}
      </p>

      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required />
        </label>
        {signingUp && (
          <label>
            Confirm password
            <input name="passwordConfirmation" type="password" autoComplete="new-password" required />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting || !csrfToken}>
          {submitting ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>
      <button className="link-button" onClick={() => { setMode(signingUp ? "signIn" : "signUp"); setError(""); }}>
        {signingUp ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  );
}
