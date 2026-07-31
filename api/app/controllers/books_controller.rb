class BooksController < ApplicationController
  before_action :require_authentication

  def index
    books = Book.order(:title)

    if params[:query].present?
      query = "%#{ActiveRecord::Base.sanitize_sql_like(params[:query])}%"
      books = books.where("title ILIKE :query OR author ILIKE :query OR isbn ILIKE :query", query: query)
    end

    render json: { books: books.map { |book| book_payload(book) } }
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

  def book_payload(book)
    active_checkout_count = book.checkouts.active.count

    {
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      description: book.description,
      published_year: book.published_year,
      active_checkout_count: active_checkout_count,
      available: active_checkout_count < 5
    }
  end
end
