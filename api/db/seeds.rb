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

def lorem_content(title)
  paragraph = <<~TEXT.squish
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante
    venenatis dapibus posuere velit aliquet. Donec sed odio dui. Aenean lacinia bibendum
    nulla sed consectetur. Cras mattis consectetur purus sit amet fermentum.
  TEXT

  "#{title}\n\n" + ([ paragraph ] * 8).join("\n\n")
end

# Real titles with genuine descriptions so the AI librarian's keyword search
# has something meaningful to find; the 5,000 synthetic volumes below exist
# for pagination and load, not discovery.
CURATED_BOOKS = [
  [ "The Time Machine", "H. G. Wells", 1895, "A Victorian inventor hurtles into the far future and finds humanity split in two. The classic science fiction time travel novella." ],
  [ "A Connecticut Yankee in King Arthur's Court", "Mark Twain", 1889, "A comic time travel satire: a practical American engineer wakes in Camelot and sets about modernizing the Middle Ages." ],
  [ "Slaughterhouse-Five", "Kurt Vonnegut", 1969, "Darkly funny science fiction. Billy Pilgrim comes unstuck in time, drifting between the firebombing of Dresden and an alien zoo." ],
  [ "Kindred", "Octavia E. Butler", 1979, "A Black woman in 1976 Los Angeles is repeatedly pulled back in time to a Maryland plantation. Time travel used to devastating literary effect." ],
  [ "The Hitchhiker's Guide to the Galaxy", "Douglas Adams", 1979, "Hilarious science fiction: Earth is demolished for a hyperspace bypass and Arthur Dent hitches a ride across a very silly galaxy." ],
  [ "Three Men in a Boat", "Jerome K. Jerome", 1889, "A very funny comic misadventure of three hapless friends (and a dog) rowing up the Thames on holiday." ],
  [ "The Importance of Being Earnest", "Oscar Wilde", 1895, "Wilde's sparkling comedy of manners, mistaken identities, and a handbag. Witty from first line to last." ],
  [ "Pride and Prejudice", "Jane Austen", 1813, "Witty romance of Elizabeth Bennet and Mr. Darcy, first impressions and second chances in Regency England." ],
  [ "Emma", "Jane Austen", 1815, "A comic romance about a confident young matchmaker who misreads every heart around her, including her own." ],
  [ "Jane Eyre", "Charlotte Brontë", 1847, "A gothic romance: an orphaned governess, a brooding employer, and a terrible secret in the attic of Thornfield Hall." ],
  [ "Frankenstein", "Mary Shelley", 1818, "The original science fiction horror story: a scientist assembles a living creature and abandons it, with tragic consequences." ],
  [ "Dracula", "Bram Stoker", 1897, "Gothic horror told in letters and diaries as a vampire count moves from Transylvania to London." ],
  [ "The Hound of the Baskervilles", "Arthur Conan Doyle", 1902, "Sherlock Holmes investigates a spectral hound haunting a family on the fog-bound moors. Classic detective mystery." ],
  [ "The Murder of Roger Ackroyd", "Agatha Christie", 1926, "Hercule Poirot untangles a village murder in the mystery with the most famous twist ending in detective fiction." ],
  [ "And Then There Were None", "Agatha Christie", 1939, "Ten strangers lured to an island are murdered one by one. A locked-room mystery masterpiece of suspense." ],
  [ "Treasure Island", "Robert Louis Stevenson", 1883, "The definitive pirate adventure: a treasure map, a sea voyage, and Long John Silver." ],
  [ "The War of the Worlds", "H. G. Wells", 1898, "Martians invade Victorian England in the founding alien invasion science fiction novel." ],
  [ "Dune", "Frank Herbert", 1965, "Epic science fiction of politics, religion, and ecology on the desert planet Arrakis, where whoever controls the spice controls the universe." ],
  [ "The Left Hand of Darkness", "Ursula K. Le Guin", 1969, "A human envoy on a planet whose people have no fixed gender. Landmark science fiction about identity, loyalty, and ice." ],
  [ "The Fifth Season", "N. K. Jemisin", 2015, "A fantasy of a world wracked by apocalyptic seasons and the oppressed earth-movers who can still it — or end it." ],
  [ "Never Let Me Go", "Kazuo Ishiguro", 2005, "A quiet dystopian science fiction novel: students at an idyllic boarding school slowly learn what their lives are for." ],
  [ "The Remains of the Day", "Kazuo Ishiguro", 1989, "An aging English butler drives through the countryside reckoning with duty, dignity, and the love he never spoke of." ],
  [ "Beloved", "Toni Morrison", 1987, "A haunting literary masterpiece: a formerly enslaved woman's house — and conscience — is haunted by the daughter she lost." ],
  [ "Giovanni's Room", "James Baldwin", 1956, "A spare, devastating literary novel of an American in Paris torn between convention and the man he loves." ],
  [ "One Hundred Years of Solitude", "Gabriel García Márquez", 1967, "Magical realism at full power: seven generations of the Buendía family in the mythical town of Macondo." ],
  [ "Mrs Dalloway", "Virginia Woolf", 1925, "One June day in London, inside and out of Clarissa Dalloway's mind, in Woolf's modernist classic." ],
  [ "Gilead", "Marilynne Robinson", 2004, "A dying Iowa preacher writes a long letter to his young son — a luminous, quiet novel about grace and fathers." ],
  [ "Lincoln in the Bardo", "George Saunders", 2017, "Funny and heartbroken at once: a chorus of ghosts watches Abraham Lincoln grieve his son in a purgatorial graveyard." ]
].freeze

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

puts "Creating #{CURATED_BOOKS.length} curated books..."
# 9xxxxxx-range ISBNs stay inside the demo "978000" prefix (so the cleanup
# above still owns them) without colliding with the synthetic 1..5000 range.
Book.insert_all!(
  CURATED_BOOKS.each_with_index.map do |(title, author, year, description), index|
    {
      title: title,
      author: author,
      isbn: format("978000%07d", 9_000_001 + index),
      description: description,
      published_year: year,
      created_at: now,
      updated_at: now
    }
  end
)

puts "Writing local book content..."
(1..5_000).each do |number|
  BookContentStore.write(format("978000%07d", number), lorem_content("The Library Collection, Volume #{number}"))
end
CURATED_BOOKS.each_with_index do |(title, _author, _year, _description), index|
  BookContentStore.write(format("978000%07d", 9_000_001 + index), lorem_content(title))
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
