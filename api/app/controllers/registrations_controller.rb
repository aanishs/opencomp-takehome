class RegistrationsController < ApplicationController
  rate_limit to: 10, within: 3.minutes, only: :create,
    with: -> { render json: { error: "Too many attempts. Please try again later." }, status: :too_many_requests }

  def create
    user = User.new(user_params)

    if user.save
      reset_session
      request.session[:user_id] = user.id
      render json: { user: user_payload(user) }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:email, :password, :password_confirmation)
  end

  def user_payload(user)
    { id: user.id, email: user.email }
  end
end
