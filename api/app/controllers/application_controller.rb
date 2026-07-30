class ApplicationController < ActionController::API
  include ActionController::Cookies
  include ActionController::RequestForgeryProtection

  protect_from_forgery with: :exception

  rescue_from ActionController::InvalidAuthenticityToken, with: :invalid_authenticity_token

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
end
