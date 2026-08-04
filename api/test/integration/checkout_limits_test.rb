require "test_helper"

class CheckoutLimitsTest < ActionDispatch::IntegrationTest
  setup do
    @token = sign_up("limits-tester@example.com")
    @user = User.find_by!(email: "limits-tester@example.com")
  end

  test "the eleventh checkout is rejected with a clear error" do
    Checkout::USER_LIMIT.times { |i| checkout!(make_book("Filler #{i}")) }

    post "/api/checkouts", params: { book_id: make_book("One Too Many").id },
      headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :unprocessable_entity
    assert_equal "You can only check out 10 books at a time", response.parsed_body["error"]
    assert_equal Checkout::USER_LIMIT, @user.checkouts.active.count
  end

  test "a book with all copies out is rejected with a clear error" do
    book = make_book("Popular")
    Checkout::BOOK_LIMIT.times do |i|
      other = User.create!(email: "holder-#{i}@example.com", password: "password123",
        password_confirmation: "password123")
      Checkout.borrow!(user: other, book: book)
    end

    post "/api/checkouts", params: { book_id: book.id },
      headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :unprocessable_entity
    assert_equal "This book is currently unavailable", response.parsed_body["error"]
  end

  test "checking out the same book twice is rejected" do
    book = make_book("Once Only")
    checkout!(book)

    post "/api/checkouts", params: { book_id: book.id },
      headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :unprocessable_entity
    assert_equal "You have already checked out this book", response.parsed_body["error"]
  end

  test "expired checkouts free up both limits" do
    Checkout::USER_LIMIT.times do |i|
      book = make_book("Expired #{i}")
      @user.checkouts.create!(book: book, checked_out_at: 2.weeks.ago, expires_at: 1.week.ago)
    end

    post "/api/checkouts", params: { book_id: make_book("Fresh Start").id },
      headers: { "X-CSRF-Token" => @token }, as: :json

    assert_response :created
    assert_equal 1, @user.checkouts.active.count
  end

  private

  def make_book(title)
    Book.create!(title: title, author: "Limit Tester", isbn: "9993#{rand(10**9)}")
  end

  def checkout!(book)
    post "/api/checkouts", params: { book_id: book.id },
      headers: { "X-CSRF-Token" => @token }, as: :json
    assert_response :created
  end

  def sign_up(email)
    get "/api/csrf"
    token = response.parsed_body.fetch("csrf_token")

    post "/api/auth/sign_up",
      params: { user: { email: email, password: "secure-password",
        password_confirmation: "secure-password" } },
      headers: { "X-CSRF-Token" => token },
      as: :json

    token
  end
end
