Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  scope :api do
    get "csrf", to: "csrf#show"
    get "me", to: "sessions#show"
    resources :books, only: %i[index show]
    resources :checkouts, only: %i[index create]
    post "auth/sign_up", to: "registrations#create"
    post "auth/login", to: "sessions#create"
    delete "auth/logout", to: "sessions#destroy"
  end
end
