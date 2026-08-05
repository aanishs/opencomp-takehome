require "test_helper"

class LibrarianEndpointTest < ActionDispatch::IntegrationTest
  test "requires authentication" do
    get "/api/csrf"
    token = response.parsed_body.fetch("csrf_token")

    post "/api/librarian",
      params: { messages: [ { role: "user", content: "What should I read?" } ] },
      headers: { "X-CSRF-Token" => token },
      as: :json

    assert_response :unauthorized
  end

  test "returns 503 when no API key is configured" do
    token = sign_up

    stubbed(Librarian, :configured?, false) do
      post "/api/librarian",
        params: { messages: [ { role: "user", content: "What should I read?" } ] },
        headers: { "X-CSRF-Token" => token },
        as: :json
    end

    assert_response :service_unavailable
    assert_match(/offline/, response.parsed_body.fetch("error"))
  end

  test "rejects a malformed conversation" do
    token = sign_up

    invalid_payloads = [
      {},                                                                  # no messages at all
      { messages: [] },                                                    # empty transcript
      { messages: [ { role: "system", content: "hi" } ] },                 # unknown role
      { messages: [ { role: "user", content: "" } ] },                     # blank content
      { messages: [ { role: "user", content: "a" * 4_001 } ] },            # over length cap
      { messages: [ { role: "assistant", content: "assistant last" } ] }   # user must speak last
    ]

    stubbed(Librarian, :configured?, true) do
      invalid_payloads.each do |payload|
        post "/api/librarian", params: payload, headers: { "X-CSRF-Token" => token }, as: :json

        assert_response :unprocessable_entity, "expected 422 for payload #{payload.inspect}"
      end
    end
  end

  test "returns the librarian's reply for a valid conversation" do
    token = sign_up

    stubbed(Librarian, :configured?, true) do
      stubbed(Librarian, :reply, "Try The Left Hand of Darkness — it fits what you described.") do
        post "/api/librarian",
          params: {
            messages: [
              { role: "user", content: "Any sci-fi about gender?" },
              { role: "assistant", content: "Let me look." },
              { role: "user", content: "Yes please." }
            ]
          },
          headers: { "X-CSRF-Token" => token },
          as: :json
      end
    end

    assert_response :success
    assert_equal "Try The Left Hand of Darkness — it fits what you described.", response.parsed_body.fetch("reply")
  end

  private

  # minitest 6 no longer bundles minitest/mock, so swap the class method by
  # hand for the block's duration.
  def stubbed(mod, name, value)
    original = mod.method(name)
    mod.singleton_class.send(:remove_method, name)
    mod.define_singleton_method(name) { |*, **| value }
    yield
  ensure
    mod.singleton_class.send(:remove_method, name)
    mod.define_singleton_method(name, original)
  end

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

    # Signing up resets the session (fixation defense), invalidating the
    # pre-auth CSRF token — fetch a fresh one, as the real client does.
    get "/api/csrf"
    response.parsed_body.fetch("csrf_token")
  end
end
