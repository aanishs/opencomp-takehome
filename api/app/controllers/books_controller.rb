class BooksController < ApplicationController
  include Paginatable

  # Every sort carries an :id tiebreak — titles, authors, and years repeat, and
  # without a deterministic total order offset pages can duplicate or drop rows.
  SORTS = {
    "title" => { title: :asc, id: :asc },
    "author" => { author: :asc, id: :asc },
    "year" => { published_year: :desc, id: :asc }
  }.freeze

  before_action :require_authentication

  def index
    books = Book.all
    query = bounded_query

    if query.present?
      like = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"
      books = books.where("title ILIKE :query OR author ILIKE :query OR isbn ILIKE :query", query: like)
    end

    if params[:available_only] == "true"
      books = books.where(<<~SQL.squish, now: Time.current, limit: Checkout::BOOK_LIMIT)
        (SELECT COUNT(*) FROM checkouts
         WHERE checkouts.book_id = books.id
           AND checkouts.returned_at IS NULL
           AND checkouts.expires_at > :now) < :limit
      SQL
    end

    scope, meta = paginate(books.order(SORTS.fetch(params[:sort], SORTS["title"])))
    records = scope.to_a
    counts = Checkout.active.where(book_id: records.map(&:id)).group(:book_id).count

    render json: {
      books: records.map { |book| book_payload(book, counts.fetch(book.id, 0)) },
      pagination: meta
    }
  end

  def show
    render json: { book: book_payload(Book.find(params[:id])) }
  end

  def read
    book = Book.find(params[:id])

    unless current_user.checkouts.active.exists?(book: book)
      return render json: { error: "You need an active checkout to read this book" }, status: :forbidden
    end

    render plain: BookContentStore.read(book.isbn), content_type: "text/plain"
  rescue BookContentStore::ContentMissing
    render json: { error: "Book content is unavailable" }, status: :not_found
  end

  private

  def book_payload(book, active_checkout_count = nil)
    active_checkout_count ||= book.checkouts.active.count

    {
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      description: book.description,
      published_year: book.published_year,
      active_checkout_count: active_checkout_count,
      available: active_checkout_count < Checkout::BOOK_LIMIT
    }
  end
end
