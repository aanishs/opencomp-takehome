class ApplicationController < ActionController::API
  include ActionController::Cookies
  include ActionController::RequestForgeryProtection

  protect_from_forgery with: :exception

  rescue_from ActionController::InvalidAuthenticityToken, with: :invalid_authenticity_token
  # A stable JSON 404 so the OpenAPI contract can specify the shape instead of
  # leaking the framework-default error page.
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  # PostgreSQL rejects strings containing NUL, so a %00 anywhere in params
  # becomes a 500 deep inside a query (found by Schemathesis fuzzing). No
  # legitimate client sends null bytes; refuse them all up front.
  before_action :reject_null_bytes

  # Target of the routes.rb catch-all; a 404 is a 404 whatever the verb, so
  # CSRF verification is skipped for it.
  skip_forgery_protection only: :route_not_found

  def route_not_found
    not_found
  end

  private

  def current_user
    @current_user ||= User.find_by(id: request.session[:user_id])
  end

  def require_authentication
    return if current_user

    render json: { error: "Authentication required" }, status: :unauthorized
  end

  def invalid_authenticity_token
    render json: { error: "Invalid CSRF token" }, status: :unprocessable_entity
  end

  def not_found
    render json: { error: "Not found" }, status: :not_found
  end

  def reject_null_bytes
    return unless contains_null_byte?(request.params)

    render json: { error: "Bad request" }, status: :bad_request
  end

  def contains_null_byte?(value)
    case value
    when String then value.include?("\0")
    when ActionController::Parameters then contains_null_byte?(value.to_unsafe_h)
    when Hash then value.any? { |key, nested| key.to_s.include?("\0") || contains_null_byte?(nested) }
    when Array then value.any? { |nested| contains_null_byte?(nested) }
    else false
    end
  end
end
