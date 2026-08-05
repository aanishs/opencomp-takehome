class ApplicationController < ActionController::API
  include ActionController::Cookies
  include ActionController::RequestForgeryProtection

  protect_from_forgery with: :exception

  rescue_from ActionController::InvalidAuthenticityToken, with: :invalid_authenticity_token
  # A stable JSON 404 so the OpenAPI contract can specify the shape instead of
  # leaking the framework-default error page.
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

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
end
