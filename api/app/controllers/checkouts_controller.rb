class CheckoutsController < ApplicationController
  before_action :require_authentication

  def index
    checkouts = current_user.checkouts.includes(:book).order(expires_at: :asc)
    active_counts = Checkout.active.where(book_id: checkouts.map(&:book_id)).group(:book_id).count

    render json: {
      checkouts: checkouts.map do |checkout|
        checkout_payload(checkout, book_active_count: active_counts.fetch(checkout.book_id, 0))
      end
    }
  end

  def return
    checkout = current_user.checkouts.find(params[:id])
    checkout.return!

    render json: { checkout: checkout_payload(checkout) }
  rescue Checkout::NotReturnable => error
    render json: { error: error.message }, status: :unprocessable_entity
  end

  def create
    book = Book.find(params[:book_id])
    checkout = Checkout.borrow!(user: current_user, book: book)

    render json: { checkout: checkout_payload(checkout) }, status: :created
  rescue Checkout::BorrowError => error
    render json: { error: error.message }, status: :unprocessable_entity
  rescue ActiveRecord::RecordInvalid => error
    render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
  end

  private

  def checkout_payload(checkout, book_active_count: nil)
    book_active_count ||= checkout.book.checkouts.active.count

    {
      id: checkout.id,
      checked_out_at: checkout.checked_out_at.iso8601,
      expires_at: checkout.expires_at.iso8601,
      returned_at: checkout.returned_at&.iso8601,
      active: checkout.active?,
      book: {
        id: checkout.book.id,
        title: checkout.book.title,
        author: checkout.book.author,
        isbn: checkout.book.isbn,
        available: book_active_count < Checkout::BOOK_LIMIT
      }
    }
  end
end
