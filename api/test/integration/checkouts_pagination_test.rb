require "test_helper"

class CheckoutsPaginationTest < ActionDispatch::IntegrationTest
  setup do
    @token = sign_up("paginator@example.com")
    @user = User.find_by!(email: "paginator@example.com")
  end

  test "the index is paginated and returns a pagination envelope" do
    40.times do |i|
      book = Book.create!(title: "History #{i}", author: "Paginator", isbn: "9989#{rand(10**9)}")
      @user.checkouts.create!(book: book, checked_out_at: 3.weeks.ago, expires_at: 2.weeks.ago)
    end

    get "/api/checkouts"

    assert_response :success
    body = response.parsed_body
    assert_equal 24, body["checkouts"].size
    assert_equal 40, body.dig("pagination", "total_count")
  end

  test "active checkouts always land on the first page ahead of older history" do
    30.times do |i|
      book = Book.create!(title: "Old #{i}", author: "Paginator", isbn: "9988#{rand(10**9)}")
      @user.checkouts.create!(book: book, checked_out_at: 3.weeks.ago, expires_at: 2.weeks.ago)
    end
    active_book = Book.create!(title: "Currently Reading", author: "Paginator", isbn: "9987#{rand(10**9)}")
    Checkout.borrow!(user: @user, book: active_book)

    get "/api/checkouts"

    titles = response.parsed_body["checkouts"].map { |c| c.dig("book", "title") }
    assert_includes titles, "Currently Reading"
    assert_equal true, response.parsed_body["checkouts"].first["active"]
  end

  test "an array book_id is a clean 404 rather than a 500" do
    real = Book.create!(title: "Real", author: "Paginator", isbn: "9986#{rand(10**9)}")

    post "/api/checkouts", params: { book_id: [ real.id ] },
      headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :not_found
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

    get "/api/csrf"
    response.parsed_body.fetch("csrf_token")
  end
end
