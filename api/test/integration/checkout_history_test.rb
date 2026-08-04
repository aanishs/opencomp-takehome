require "test_helper"

class CheckoutHistoryTest < ActionDispatch::IntegrationTest
  setup do
    @token = sign_up("historian@example.com")
    @user = User.find_by!(email: "historian@example.com")
  end

  test "the index includes ended checkouts with their cause and book availability" do
    returned_book = Book.create!(title: "Given Back", author: "History Tester", isbn: "9997#{rand(10**9)}")
    returned = Checkout.borrow!(user: @user, book: returned_book)
    returned.return!

    expired_book = Book.create!(title: "Timed Out", author: "History Tester", isbn: "9998#{rand(10**9)}")
    @user.checkouts.create!(book: expired_book, checked_out_at: 2.weeks.ago, expires_at: 1.week.ago)
    Checkout::BOOK_LIMIT.times do |i|
      holder = User.create!(email: "history-holder-#{i}@example.com", password: "password123",
        password_confirmation: "password123")
      Checkout.borrow!(user: holder, book: expired_book)
    end

    get "/api/checkouts"

    assert_response :success
    payloads = response.parsed_body["checkouts"].index_by { |checkout| checkout.dig("book", "title") }

    returned_payload = payloads.fetch("Given Back")
    assert_equal false, returned_payload["active"]
    assert returned_payload["returned_at"].present?
    assert_equal true, returned_payload.dig("book", "available")

    expired_payload = payloads.fetch("Timed Out")
    assert_equal false, expired_payload["active"]
    assert_nil expired_payload["returned_at"]
    assert_equal false, expired_payload.dig("book", "available")
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
