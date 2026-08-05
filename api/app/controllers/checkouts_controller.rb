class CheckoutsController < ApplicationController
  include Paginatable

  before_action :require_authentication

  def index
    # Active checkouts first (they're capped at 10, so page 1 always holds the
    # full active set), then most-recent history. Ordering is server-controlled
    # SQL, no user input.
    checkouts = current_user.checkouts
      .order(Arel.sql("(returned_at IS NULL AND expires_at > NOW()) DESC"))
      .order(created_at: :desc)
    scope, meta = paginate(checkouts)
    records = scope.includes(:book).to_a
    active_counts = Checkout.active.where(book_id: records.map(&:book_id)).group(:book_id).count

    render json: {
      checkouts: records.map do |checkout|
        checkout_payload(checkout, book_active_count: active_counts.fetch(checkout.book_id, 0))
      end,
      pagination: meta
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
    book = Book.find(scalar_param(:book_id))
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
