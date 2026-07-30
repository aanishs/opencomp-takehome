require "test_helper"

class AuthenticationTest < ActionDispatch::IntegrationTest
  test "a user can sign up and retrieve their session" do
    token = csrf_token

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

    assert_response :created
    assert_equal "reader@example.com", response.parsed_body.dig("user", "email")

    get "/api/me"

    assert_response :success
    assert_equal "reader@example.com", response.parsed_body.dig("user", "email")
  end

  test "invalid credentials are rejected" do
    token = csrf_token

    post "/api/auth/login",
      params: { email: "missing@example.com", password: "not-the-password" },
      headers: { "X-CSRF-Token" => token },
      as: :json

    assert_response :unauthorized
  end

  private

  def csrf_token
    get "/api/csrf"
    response.parsed_body.fetch("csrf_token")
  end
end
