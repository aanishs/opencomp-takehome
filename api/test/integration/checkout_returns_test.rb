require "test_helper"

class CheckoutReturnsTest < ActionDispatch::IntegrationTest
  setup do
    @token = sign_up("returner@example.com")
    @user = User.find_by!(email: "returner@example.com")
    @book = Book.create!(title: "Borrowed and Back", author: "Return Tester", isbn: "9994#{rand(10**9)}")
  end

  test "returning an active checkout ends it and frees the copy" do
    checkout = Checkout.borrow!(user: @user, book: @book)

    post "/api/checkouts/#{checkout.id}/return", headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :success
    assert response.parsed_body.dig("checkout", "returned_at").present?
    assert_equal false, response.parsed_body.dig("checkout", "active")
    assert_equal 0, @book.checkouts.active.count
  end

  test "a returned book can be checked out again" do
    checkout = Checkout.borrow!(user: @user, book: @book)
    checkout.return!

    post "/api/checkouts", params: { book_id: @book.id },
      headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :created
  end

  test "returning frees a slot against the per-user cap" do
    checkouts = Array.new(Checkout::USER_LIMIT) do |i|
      book = Book.create!(title: "Filler #{i}", author: "Return Tester", isbn: "9995#{rand(10**9)}")
      Checkout.borrow!(user: @user, book: book)
    end

    post "/api/checkouts", params: { book_id: @book.id },
      headers: { "X-CSRF-Token" => @token }, as: :json
    assert_response :unprocessable_entity

    post "/api/checkouts/#{checkouts.first.id}/return", headers: { "X-CSRF-Token" => @token }, as: :json
    assert_response :success

    post "/api/checkouts", params: { book_id: @book.id },
      headers: { "X-CSRF-Token" => @token }, as: :json
    assert_response :created
  end

  test "returning twice is rejected and the original timestamp is kept" do
    checkout = Checkout.borrow!(user: @user, book: @book)
    checkout.return!
    original = checkout.returned_at

    post "/api/checkouts/#{checkout.id}/return", headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :unprocessable_entity
    assert_equal "This checkout is no longer active", response.parsed_body["error"]
    assert_equal original, checkout.reload.returned_at
  end

  test "returning an expired checkout is rejected" do
    checkout = @user.checkouts.create!(book: @book, checked_out_at: 2.weeks.ago, expires_at: 1.week.ago)

    post "/api/checkouts/#{checkout.id}/return", headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :unprocessable_entity
    assert_nil checkout.reload.returned_at
  end

  test "another user's checkout cannot be returned" do
    other = User.create!(email: "someone-else@example.com", password: "password123",
      password_confirmation: "password123")
    checkout = Checkout.borrow!(user: other, book: @book)

    post "/api/checkouts/#{checkout.id}/return", headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :not_found
    assert checkout.reload.active?
  end

  test "reading requires an active checkout and stops after return" do
    BookContentStore.write(@book.isbn, "Guarded pages.")

    get "/api/books/#{@book.id}/read"
    assert_response :forbidden

    checkout = Checkout.borrow!(user: @user, book: @book)
    get "/api/books/#{@book.id}/read"
    assert_response :success

    checkout.return!
    get "/api/books/#{@book.id}/read"
    assert_response :forbidden
    assert_equal "You need an active checkout to read this book", response.parsed_body["error"]
  end

  private

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
