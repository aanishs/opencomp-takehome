require "test_helper"

class AuthSecurityTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "secure@example.com", password: "correct-horse",
      password_confirmation: "correct-horse")
  end

  test "login rotates the session" do
    token = csrf_token
    presession_cookie = cookies["_online_library_session"]
    assert presession_cookie.present?

    login(token, password: "correct-horse")

    assert_response :success
    assert_not_equal presession_cookie, cookies["_online_library_session"],
      "the pre-authentication session must not survive login"
  end

  test "requests without a CSRF token are rejected" do
    post "/api/auth/login", params: { email: "secure@example.com", password: "correct-horse" }, as: :json

    assert_response :unprocessable_entity
    assert_equal "Invalid CSRF token", response.parsed_body["error"]
  end

  test "wrong password for an existing account is rejected" do
    login(csrf_token, password: "wrong")

    assert_response :unauthorized
    assert_equal "Invalid email or password", response.parsed_body["error"]
  end

  test "login attempts are rate limited" do
    token = csrf_token

    10.times do
      login(token, password: "wrong")
      assert_response :unauthorized
    end

    login(token, password: "wrong")

    assert_response :too_many_requests
    assert_equal "Too many attempts. Please try again later.", response.parsed_body["error"]
  end

  test "sign up attempts are rate limited" do
    10.times do |i|
      sign_up("burst-#{i}@example.com")
      assert_response :created
    end

    sign_up("burst-11@example.com")

    assert_response :too_many_requests
  end

  test "a too-short password is rejected at sign up" do
    post "/api/auth/sign_up",
      params: { user: { email: "shorty@example.com", password: "abc", password_confirmation: "abc" } },
      headers: { "X-CSRF-Token" => csrf_token },
      as: :json

    assert_response :unprocessable_entity
    assert_includes response.parsed_body["errors"].join, "Password"
  end

  test "duplicate email sign up is rejected" do
    sign_up("secure@example.com")

    assert_response :unprocessable_entity
    assert_includes response.parsed_body["errors"].join, "Email"
  end

  test "logout ends the session" do
    login(csrf_token, password: "correct-horse")
    assert_response :success

    delete "/api/auth/logout", headers: { "X-CSRF-Token" => csrf_token }
    assert_response :no_content

    get "/api/me"
    assert_response :unauthorized
  end

  private

  def csrf_token
    get "/api/csrf"
    response.parsed_body.fetch("csrf_token")
  end

  def login(token, password:)
    post "/api/auth/login",
      params: { email: "secure@example.com", password: password },
      headers: { "X-CSRF-Token" => token },
      as: :json
  end

  # Each successful sign-up resets the session, so every attempt needs a
  # token minted for the session it will actually be verified against.
  def sign_up(email)
    post "/api/auth/sign_up",
      params: { user: { email: email, password: "secure-password",
        password_confirmation: "secure-password" } },
      headers: { "X-CSRF-Token" => csrf_token },
      as: :json
  end
end
