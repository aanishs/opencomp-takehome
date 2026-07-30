class SessionsController < ApplicationController
  before_action :require_authentication, only: :show

  def show
    render json: { user: user_payload(current_user) }
  end

  def create
    user = User.find_by(email: params[:email].to_s.strip.downcase)

    if user&.authenticate(params[:password])
      request.session[:user_id] = user.id
      render json: { user: user_payload(user) }
    else
      render json: { error: "Invalid email or password" }, status: :unauthorized
    end
  end

  def destroy
    request.session.delete(:user_id)
    head :no_content
  end

  private

  def user_payload(user)
    { id: user.id, email: user.email }
  end
end
