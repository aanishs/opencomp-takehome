# Black-box test hooks. These routes are only drawn when TEST_SEAM=enabled
# outside production (see config/routes.rb) and are deliberately absent from
# openapi/openapi.yaml — they are scaffolding for the TypeScript suite, not
# part of the product contract.
class TestSeamController < ApplicationController
  skip_forgery_protection

  DEFAULT_PASSWORD = "password123"

  # Wipe all state, including the rate-limiter's cache so a 429 exercised by
  # one spec can't poison the next run.
  def reset
    Checkout.delete_all
    User.delete_all
    Book.delete_all
    Rails.cache.clear
    head :no_content
  end

  # Bulk-create records with arbitrary attributes — the only way black-box
  # tests can produce otherwise unreachable states like an expired checkout
  # (expires_at in the past) without waiting a week.
  def factory
    users = []
    books = []
    checkouts = []

    ActiveRecord::Base.transaction do
      users = Array(params[:users]).map { |attrs| create_user(attrs) }
      books = Array(params[:books]).map { |attrs| create_book(attrs) }
      checkouts = Array(params[:checkouts]).map { |attrs| create_checkout(attrs) }
    end

    render json: {
      users: users.map { |user| { id: user.id, email: user.email } },
      books: books.map { |book| { id: book.id, title: book.title, isbn: book.isbn } },
      checkouts: checkouts.map do |checkout|
        {
          id: checkout.id,
          user_id: checkout.user_id,
          book_id: checkout.book_id,
          checked_out_at: checkout.checked_out_at.iso8601,
          expires_at: checkout.expires_at.iso8601,
          returned_at: checkout.returned_at&.iso8601
        }
      end
    }, status: :created
  end

  # Establish a session without bcrypt or the login rate limit so the suite
  # stays fast and can't 429 itself; the real login path has its own specs.
  def login_as
    user = User.find(params.require(:user_id))
    reset_session
    request.session[:user_id] = user.id
    head :no_content
  end

  private

  def create_user(attrs)
    password = attrs[:password].presence || DEFAULT_PASSWORD
    User.create!(
      email: attrs.require(:email),
      password: password,
      password_confirmation: password
    )
  end

  def create_book(attrs)
    book = Book.create!(
      title: attrs[:title].presence || "Test Book",
      author: attrs[:author].presence || "Test Author",
      isbn: attrs[:isbn].presence || format("999%010d", SecureRandom.random_number(10**10)),
      description: attrs[:description],
      published_year: attrs[:published_year]
    )
    BookContentStore.write(book.isbn, attrs[:content].presence || "#{book.title}\n\nTest content for #{book.title}.")
    book
  end

  def create_checkout(attrs)
    Checkout.create!(
      user_id: attrs.require(:user_id),
      book_id: attrs.require(:book_id),
      checked_out_at: attrs[:checked_out_at].presence || Time.current,
      expires_at: attrs[:expires_at].presence || Checkout::LOAN_DURATION.from_now,
      returned_at: attrs[:returned_at].presence
    )
  end
end
