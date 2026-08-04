require "test_helper"

# Regression tests for the check-then-insert race in Checkout.borrow!.
# Transactional test wrapping is disabled so each thread's transaction commits
# for real; teardown cleans up explicitly since nothing rolls back.
class CheckoutConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  setup do
    @suffix = SecureRandom.hex(4)
    @book = Book.create!(title: "Contended Copy", author: "Race Test", isbn: "9990#{rand(10**9)}")
    @users = Array.new(8) do |i|
      User.create!(
        email: "race-#{i}-#{@suffix}@example.com",
        password: "password123",
        password_confirmation: "password123"
      )
    end
  end

  teardown do
    Checkout.where(user: @users).or(Checkout.where(book: @book)).delete_all
    Book.where(id: @book.id).delete_all
    User.where(id: @users.map(&:id)).delete_all
  end

  test "concurrent borrows never oversubscribe the per-book cap" do
    barrier = Concurrent::CyclicBarrier.new(@users.size)

    results = @users.map { |user|
      Thread.new do
        barrier.wait
        ApplicationRecord.connection_pool.with_connection do
          Checkout.borrow!(user: user, book: @book)
          :borrowed
        rescue Checkout::BookUnavailable
          :rejected
        end
      end
    }.map(&:value)

    assert_equal Checkout::BOOK_LIMIT, results.count(:borrowed)
    assert_equal Checkout::BOOK_LIMIT, @book.checkouts.active.count
  end

  test "concurrent duplicate borrows by one user create exactly one checkout" do
    user = @users.first
    barrier = Concurrent::CyclicBarrier.new(4)

    results = Array.new(4) {
      Thread.new do
        barrier.wait
        ApplicationRecord.connection_pool.with_connection do
          Checkout.borrow!(user: user, book: @book)
          :borrowed
        rescue Checkout::AlreadyCheckedOut
          :rejected
        end
      end
    }.map(&:value)

    assert_equal 1, results.count(:borrowed)
    assert_equal 1, user.checkouts.active.where(book: @book).count
  end

  test "concurrent borrows never exceed the per-user cap" do
    user = @users.first
    books = Array.new(Checkout::USER_LIMIT - 1) do |i|
      Book.create!(title: "Filler #{i}", author: "Race Test", isbn: "9991#{rand(10**9)}")
    end
    books.each { |book| Checkout.borrow!(user: user, book: book) }

    contenders = Array.new(4) do |i|
      Book.create!(title: "Contender #{i}", author: "Race Test", isbn: "9992#{rand(10**9)}")
    end
    barrier = Concurrent::CyclicBarrier.new(contenders.size)

    results = contenders.map { |book|
      Thread.new do
        barrier.wait
        ApplicationRecord.connection_pool.with_connection do
          Checkout.borrow!(user: user, book: book)
          :borrowed
        rescue Checkout::UserLimitReached
          :rejected
        end
      end
    }.map(&:value)

    assert_equal 1, results.count(:borrowed)
    assert_equal Checkout::USER_LIMIT, user.checkouts.active.count
  ensure
    Checkout.where(book: (books || []) + (contenders || [])).delete_all
    Book.where(id: ((books || []) + (contenders || [])).map(&:id)).delete_all
  end
end
