class Checkout < ApplicationRecord
  USER_LIMIT = 10
  BOOK_LIMIT = 5
  LOAN_DURATION = 1.week

  class BorrowError < StandardError; end

  class UserLimitReached < BorrowError
    def message = "You can only check out #{USER_LIMIT} books at a time"
  end

  class BookUnavailable < BorrowError
    def message = "This book is currently unavailable"
  end

  class AlreadyCheckedOut < BorrowError
    def message = "You have already checked out this book"
  end

  class NotReturnable < StandardError
    def message = "This checkout is no longer active"
  end

  belongs_to :user
  belongs_to :book

  scope :active, -> { where(returned_at: nil).where("expires_at > ?", Time.current) }

  def active?
    returned_at.nil? && expires_at.future?
  end

  # Guarded UPDATE so two concurrent returns (or a return racing expiry) can't
  # both succeed or overwrite the original returned_at.
  def return!
    updated = self.class.active.where(id: id).update_all(returned_at: Time.current)
    raise NotReturnable if updated.zero?

    reload
  end

  # The cap checks and the insert must be atomic: two concurrent requests can
  # otherwise both pass a count of 4 and oversubscribe a 5-copy book. Locking
  # the user row and then the book row serializes competing borrows; every
  # code path that takes both locks must use this same order.
  def self.borrow!(user:, book:)
    transaction do
      user.lock!
      book.lock!

      raise UserLimitReached if user.checkouts.active.count >= USER_LIMIT
      raise BookUnavailable if book.checkouts.active.count >= BOOK_LIMIT
      raise AlreadyCheckedOut if user.checkouts.active.exists?(book: book)

      create!(
        user: user,
        book: book,
        checked_out_at: Time.current,
        expires_at: LOAN_DURATION.from_now
      )
    end
  end
end
