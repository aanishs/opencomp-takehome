Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  scope :api do
    get "csrf", to: "csrf#show"
    get "me", to: "sessions#show"
    resources :books, only: %i[index show] do
      get :read, on: :member
    end
    resources :checkouts, only: %i[index create] do
      post :return, on: :member
    end
    post "librarian", to: "librarian#create"
    post "auth/sign_up", to: "registrations#create"
    post "auth/login", to: "sessions#create"
    delete "auth/logout", to: "sessions#destroy"

    # Test seam for the black-box TypeScript suite. Routes exist only when
    # explicitly enabled outside production; they are not in the OpenAPI
    # contract.
    if ENV["TEST_SEAM"] == "enabled" && !Rails.env.production?
      post "test/reset", to: "test_seam#reset"
      post "test/factory", to: "test_seam#factory"
      post "test/login_as", to: "test_seam#login_as"
    end
  end

  # Unmatched routes render the contract's {error} 404 instead of the
  # framework's debug page (which leaks exception traces in dev/test).
  match "*unmatched", to: "application#route_not_found", via: :all
end
