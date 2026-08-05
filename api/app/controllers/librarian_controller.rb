class LibrarianController < ApplicationController
  MAX_MESSAGES = 30
  MAX_MESSAGE_LENGTH = 4_000

  class InvalidConversation < StandardError; end

  before_action :require_authentication

  # Each request costs real API money, so throttle harder than free endpoints.
  rate_limit to: 10, within: 3.minutes, only: :create,
    with: -> { render json: { error: "The librarian needs a short break. Please try again in a few minutes." }, status: :too_many_requests }

  def create
    # Validate the transcript before the availability check: a malformed
    # request is a 422 whether or not the librarian is configured.
    messages = conversation

    unless Librarian.configured?
      return render json: { error: "The librarian is offline (no ANTHROPIC_API_KEY configured)." }, status: :service_unavailable
    end

    render json: { reply: Librarian.reply(user: current_user, messages: messages) }
  rescue InvalidConversation
    render json: { error: "Invalid conversation" }, status: :unprocessable_entity
  rescue Anthropic::Errors::RateLimitError
    render json: { error: "The librarian is busy right now. Please try again in a minute." }, status: :service_unavailable
  rescue Anthropic::Errors::APIError => e
    Rails.logger.error("Librarian request failed: #{e.class}: #{e.message}")
    render json: { error: "The librarian is temporarily unavailable." }, status: :bad_gateway
  end

  private

  # The transcript comes from the client, so re-validate its whole shape:
  # bounded length, known roles, non-empty string content, user speaks last.
  def conversation
    raw = params[:messages]
    raise InvalidConversation unless raw.is_a?(Array) && raw.any? && raw.size <= MAX_MESSAGES

    messages = raw.map do |entry|
      role = entry[:role]
      content = entry[:content]

      unless %w[user assistant].include?(role) &&
             content.is_a?(String) && content.strip.present? && content.length <= MAX_MESSAGE_LENGTH
        raise InvalidConversation
      end

      { role: role, content: content }
    end

    raise InvalidConversation unless messages.last[:role] == "user"

    messages
  end
end
