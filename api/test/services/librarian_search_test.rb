require "test_helper"

class LibrarianSearchTest < ActiveSupport::TestCase
  test "ranks books matching more query terms first" do
    weaker = Book.create!(title: "A History of Clocks", author: "A. Horologist", isbn: "9780000000001",
      description: "Time through the ages.")
    stronger = Book.create!(title: "The Time Travelers", author: "B. Jumper", isbn: "9780000000002",
      description: "A funny romp through time travel gone wrong.")

    results = Librarian.search_catalog("funny time travel")

    assert_equal [ stronger.id, weaker.id ], results.map { |book| book.fetch(:id) }
  end

  test "reports availability and truncates descriptions" do
    book = Book.create!(title: "Borrowed Everywhere", author: "C. Popular", isbn: "9780000000003",
      description: "x" * 500)
    Checkout::BOOK_LIMIT.times do |i|
      user = User.create!(email: "borrower#{i}@example.com", password: "secure-password")
      Checkout.create!(user: user, book: book, checked_out_at: Time.current, expires_at: 1.week.from_now)
    end

    result = Librarian.search_catalog("borrowed everywhere").sole

    assert_not result.fetch(:available)
    assert_operator result.fetch(:description).length, :<=, Librarian::DESCRIPTION_LIMIT
  end

  test "returns an empty list for blank queries" do
    assert_equal [], Librarian.search_catalog("   ")
    assert_equal [], Librarian.search_catalog(nil)
  end
end
