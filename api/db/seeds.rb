# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
#
# Example:
#
#   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
#     MovieGenre.find_or_create_by!(name: genre_name)
#   end
puts "Removing existing demo library records..."

demo_users = User.where("email LIKE ?", "reader%@example.com")
demo_books = Book.where("isbn LIKE ?", "978000%")

Checkout.where(user_id: demo_users.select(:id)).delete_all
Checkout.where(book_id: demo_books.select(:id)).delete_all
demo_users.delete_all
demo_books.delete_all
Dir.glob(BookContentStore.root.join("978000*.txt")).each { |path| FileUtils.rm_f(path) }

now = Time.current
password_digest = BCrypt::Password.create("password123")

authors = [
  "Octavia E. Butler",
  "James Baldwin",
  "Ursula K. Le Guin",
  "Toni Morrison",
  "Kazuo Ishiguro",
  "N. K. Jemisin",
  "Gabriel García Márquez",
  "Virginia Woolf",
  "George Saunders",
  "Marilynne Robinson"
]

def lorem_content(number)
  paragraph = <<~TEXT.squish
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante
    venenatis dapibus posuere velit aliquet. Donec sed odio dui. Aenean lacinia bibendum
    nulla sed consectetur. Cras mattis consectetur purus sit amet fermentum.
  TEXT

  "The Library Collection, Volume #{number}\n\n" + ([ paragraph ] * 8).join("\n\n")
end

puts "Creating 750 demo readers..."
User.insert_all!(
  (1..750).map do |number|
    {
      email: "reader#{number}@example.com",
      password_digest: password_digest,
      created_at: now,
      updated_at: now
    }
  end
)

puts "Creating 5,000 books..."
Book.insert_all!(
  (1..5_000).map do |number|
    {
      title: "The Library Collection, Volume #{number}",
      author: authors[number % authors.length],
      isbn: format("978000%07d", number),
      description: "A volume from the Online Library candidate exercise collection.",
      published_year: 1950 + (number % 76),
      created_at: now,
      updated_at: now
    }
  end
)

puts "Writing local book content..."
(1..5_000).each do |number|
  BookContentStore.write(format("978000%07d", number), lorem_content(number))
end

user_ids = User.where("email LIKE ?", "reader%@example.com").order(:id).pluck(:id)
book_ids = Book.where("isbn LIKE ?", "978000%").order(:id).pluck(:id)

active_checkouts = []
book_ids.first(500).each_with_index do |book_id, book_index|
  5.times do |copy_number|
    checked_out_at = now - ((book_index + copy_number) % 7).days
    active_checkouts << {
      user_id: user_ids[(book_index * 5 + copy_number) % user_ids.length],
      book_id: book_id,
      checked_out_at: checked_out_at,
      expires_at: checked_out_at + 1.week,
      created_at: checked_out_at,
      updated_at: checked_out_at
    }
  end
end

puts "Creating #{active_checkouts.length} active checkouts..."
Checkout.insert_all!(active_checkouts)

expired_checkouts = (0...12_500).map do |number|
  checked_out_at = now - (14 + (number % 365)).days

  {
    user_id: user_ids[number % user_ids.length],
    book_id: book_ids[number % book_ids.length],
    checked_out_at: checked_out_at,
    expires_at: checked_out_at + 1.week,
    created_at: checked_out_at,
    updated_at: checked_out_at
  }
end

puts "Creating #{expired_checkouts.length} expired checkouts..."
Checkout.insert_all!(expired_checkouts)

puts "Done. Sign in with reader1@example.com and password123."
