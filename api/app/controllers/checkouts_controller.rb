class CheckoutsController < ApplicationController
  before_action :require_authentication

  def index
    checkouts = current_user.checkouts.order(expires_at: :asc)

    render json: { checkouts: checkouts.map { |checkout| checkout_payload(checkout) } }
  end

  def create
    book = Book.find(params[:book_id])

    if current_user.checkouts.active.count >= 10
      return render json: { error: "You can only check out 10 books at a time" }, status: :unprocessable_entity
    end

    if book.checkouts.active.count >= 5
      return render json: { error: "This book is currently unavailable" }, status: :unprocessable_entity
    end

    if current_user.checkouts.active.exists?(book: book)
      return render json: { error: "You have already checked out this book" }, status: :unprocessable_entity
    end

    checkout = current_user.checkouts.create!(
      book: book,
      checked_out_at: Time.current,
      expires_at: 1.week.from_now
    )

    render json: { checkout: checkout_payload(checkout) }, status: :created
  end

  private

  def checkout_payload(checkout)
    {
      id: checkout.id,
      checked_out_at: checkout.checked_out_at.iso8601,
      expires_at: checkout.expires_at.iso8601,
      active: checkout.expires_at.future?,
      book: {
        id: checkout.book.id,
        title: checkout.book.title,
        author: checkout.book.author,
        isbn: checkout.book.isbn
      }
    }
  end
end
