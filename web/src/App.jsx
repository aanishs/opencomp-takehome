import { useEffect, useState } from "react";

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

function Library({ user, csrfToken, onSignOut }) {
  const [books, setBooks] = useState([]);
  const [checkouts, setCheckouts] = useState([]);
  const [query, setQuery] = useState("");
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadLibrary("");
  }, []);

  async function loadLibrary(searchQuery) {
    setLoadingBooks(true);
    setError("");

    try {
      const [booksResponse, checkoutsResponse] = await Promise.all([
        fetch(`${apiUrl}/api/books?query=${encodeURIComponent(searchQuery)}`, { credentials: "include" }),
        fetch(`${apiUrl}/api/checkouts`, { credentials: "include" }),
      ]);
      const [booksBody, checkoutsBody] = await Promise.all([
        responseBody(booksResponse),
        responseBody(checkoutsResponse),
      ]);
      setBooks(booksBody.books);
      setCheckouts(checkoutsBody.checkouts);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingBooks(false);
    }
  }

  function search(event) {
    event.preventDefault();
    loadLibrary(query);
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

  const activeCheckoutIds = new Set(checkouts.filter((checkout) => checkout.active).map((checkout) => checkout.book.id));
  const activeCheckouts = checkouts.filter((checkout) => checkout.active);

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
          <form className="search-form" onSubmit={search}>
            <input
              aria-label="Search by title, author, or ISBN"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, author, or ISBN"
            />
            <button type="submit">Search</button>
          </form>

          {error && <p className="error">{error}</p>}
          {loadingBooks ? <p>Loading books…</p> : (
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
                </li>
              ))}
            </ul>
          ) : <p>Nothing checked out yet.</p>}
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
