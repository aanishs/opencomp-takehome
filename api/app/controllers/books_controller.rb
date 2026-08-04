class BooksController < ApplicationController
  PER_PAGE_DEFAULT = 24
  PER_PAGE_MAX = 100

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

    if params[:query].present?
      query = "%#{ActiveRecord::Base.sanitize_sql_like(params[:query])}%"
      books = books.where("title ILIKE :query OR author ILIKE :query OR isbn ILIKE :query", query: query)
    end

    if params[:available_only] == "true"
      books = books.where(<<~SQL.squish, now: Time.current, limit: Checkout::BOOK_LIMIT)
        (SELECT COUNT(*) FROM checkouts
         WHERE checkouts.book_id = books.id
           AND checkouts.returned_at IS NULL
           AND checkouts.expires_at > :now) < :limit
      SQL
    end

    total_count = books.count
    page = [ params[:page].to_i, 1 ].max
    per_page = params[:per_page].to_i
    per_page = PER_PAGE_DEFAULT unless per_page.positive?
    per_page = [ per_page, PER_PAGE_MAX ].min
    total_pages = (total_count.to_f / per_page).ceil

    records = books.order(SORTS.fetch(params[:sort], SORTS["title"]))
      .offset((page - 1) * per_page)
      .limit(per_page)
      .to_a

    counts = Checkout.active.where(book_id: records.map(&:id)).group(:book_id).count

    render json: {
      books: records.map { |book| book_payload(book, counts.fetch(book.id, 0)) },
      pagination: {
        page: page,
        per_page: per_page,
        total_pages: total_pages,
        total_count: total_count
      }
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
