require "test_helper"

class BooksSearchTest < ActionDispatch::IntegrationTest
  setup do
    sign_up("searcher@example.com")
    @user = User.find_by!(email: "searcher@example.com")
  end

  test "the index is paginated with a default page size and an envelope" do
    30.times { |i| make_book(title: "Same Title", author: "Author #{i}") }

    get "/api/books"

    assert_response :success
    body = response.parsed_body
    assert_equal 24, body["books"].size
    assert_equal({ "page" => 1, "per_page" => 24, "total_pages" => 2, "total_count" => 30 },
      body["pagination"])
  end

  test "identically-sorted rows never duplicate or drop across pages" do
    30.times { |i| make_book(title: "Same Title", author: "Author #{i}") }

    get "/api/books", params: { per_page: 10 }
    first_page_ids = response.parsed_body["books"].map { |book| book["id"] }
    get "/api/books", params: { per_page: 10, page: 2 }
    second_page_ids = response.parsed_body["books"].map { |book| book["id"] }
    get "/api/books", params: { per_page: 10, page: 3 }
    third_page_ids = response.parsed_body["books"].map { |book| book["id"] }

    all_ids = first_page_ids + second_page_ids + third_page_ids
    assert_equal 30, all_ids.size
    assert_equal 30, all_ids.uniq.size
  end

  test "per_page is capped" do
    get "/api/books", params: { per_page: 5000 }

    assert_response :success
    assert_equal 100, response.parsed_body.dig("pagination", "per_page")
  end

  test "sorting by author and by year is supported" do
    make_book(title: "B", author: "Zed", published_year: 1990)
    make_book(title: "A", author: "Abel", published_year: 2020)

    get "/api/books", params: { sort: "author" }
    assert_equal %w[Abel Zed], response.parsed_body["books"].map { |book| book["author"] }

    get "/api/books", params: { sort: "year" }
    assert_equal [ 2020, 1990 ], response.parsed_body["books"].map { |book| book["published_year"] }
  end

  test "available_only excludes fully checked out books" do
    available = make_book(title: "Free Copy")
    full = make_book(title: "All Out")
    Checkout::BOOK_LIMIT.times do |i|
      holder = User.create!(email: "holder-#{i}@example.com", password: "password123",
        password_confirmation: "password123")
      Checkout.borrow!(user: holder, book: full)
    end

    get "/api/books", params: { available_only: "true" }

    ids = response.parsed_body["books"].map { |book| book["id"] }
    assert_includes ids, available.id
    assert_not_includes ids, full.id
  end

  test "query filters and combines with pagination" do
    5.times { |i| make_book(title: "Unique Walrus #{i}") }
    make_book(title: "Something else")

    get "/api/books", params: { query: "Unique Walrus", per_page: 3 }

    body = response.parsed_body
    assert_equal 3, body["books"].size
    assert_equal 5, body.dig("pagination", "total_count")
    assert_equal 2, body.dig("pagination", "total_pages")
  end

  private

  def make_book(title:, author: "Search Tester", published_year: nil)
    Book.create!(title: title, author: author, isbn: "9996#{rand(10**9)}",
      published_year: published_year)
  end

  def sign_up(email)
    get "/api/csrf"
    token = response.parsed_body.fetch("csrf_token")

    post "/api/auth/sign_up",
      params: { user: { email: email, password: "secure-password",
        password_confirmation: "secure-password" } },
      headers: { "X-CSRF-Token" => token },
      as: :json

    # Signing up resets the session (fixation defense), invalidating the
    # pre-auth CSRF token — fetch a fresh one, as the real client does.
    get "/api/csrf"
    response.parsed_body.fetch("csrf_token")
  end
end
