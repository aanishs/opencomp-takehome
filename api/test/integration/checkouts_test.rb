require "test_helper"

class CheckoutsTest < ActionDispatch::IntegrationTest
  test "a signed-in user can check out an available book for one week" do
    token = sign_up
    book = Book.create!(title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn: "9780441478125")

    post "/api/checkouts",
      params: { book_id: book.id },
      headers: { "X-CSRF-Token" => token },
      as: :json

    assert_response :created
    assert_equal book.title, response.parsed_body.dig("checkout", "book", "title")
    assert_equal 1.week.from_now.to_date, Time.iso8601(response.parsed_body.dig("checkout", "expires_at")).to_date
  end

  private

  def sign_up
    get "/api/csrf"
    token = response.parsed_body.fetch("csrf_token")

    post "/api/auth/sign_up",
      params: {
        user: {
          email: "reader@example.com",
          password: "secure-password",
          password_confirmation: "secure-password"
        }
      },
      headers: { "X-CSRF-Token" => token },
      as: :json

    token
  end
end
