class SessionsController < ApplicationController
  # Precomputed once so a login against a nonexistent email costs one bcrypt
  # comparison, same as a real one — response timing no longer reveals which
  # emails have accounts.
  DUMMY_PASSWORD_DIGEST = BCrypt::Password.create("timing-equalizer").to_s.freeze

  rate_limit to: 10, within: 3.minutes, only: :create,
    with: -> { render json: { error: "Too many attempts. Please try again later." }, status: :too_many_requests }

  before_action :require_authentication, only: :show

  def show
    render json: { user: user_payload(current_user) }
  end

  def create
    user = User.find_by(email: params[:email].to_s.strip.downcase)
    authenticated = user ? user.authenticate(params[:password]) : equalize_timing

    if authenticated
      reset_session
      request.session[:user_id] = user.id
      render json: { user: user_payload(user) }
    else
      render json: { error: "Invalid email or password" }, status: :unauthorized
    end
  end

  def destroy
    reset_session
    head :no_content
  end

  private

  def equalize_timing
    BCrypt::Password.new(DUMMY_PASSWORD_DIGEST).is_password?(params[:password].to_s)
    false
  end

  def user_payload(user)
    { id: user.id, email: user.email }
  end
end
