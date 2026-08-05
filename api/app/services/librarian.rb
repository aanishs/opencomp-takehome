# AI librarian: answers natural-language questions ("something short and funny
# about time travel") by searching the real catalog through a tool, so every
# recommendation is a book that actually exists here and can be checked out.
class Librarian
  MODEL = :"claude-opus-5"
  MAX_TOKENS = 16_000
  RESULT_LIMIT = 12
  DESCRIPTION_LIMIT = 280
  HISTORY_LIMIT = 15
  # Cap how many search terms feed the SQL — the query string is model-written,
  # so treat it like user input.
  TERM_LIMIT = 6

  FALLBACK_REPLY = "I'm sorry, I can't help with that request. Is there a book you'd like to find?"

  class SearchBooksInput < Anthropic::BaseModel
    required :query, String,
      doc: "Keywords matched against titles, authors, and descriptions. " \
           "Single words or short phrases work best; run several searches with different terms for broad requests."
  end

  class SearchBooks < Anthropic::BaseTool
    doc "Search this library's catalog. Returns a JSON array of books (id, title, author, " \
        "published_year, description, available). An empty array means nothing matched — try different keywords."

    input_schema SearchBooksInput

    def call(input)
      Librarian.search_catalog(input.query).to_json
    end
  end

  def self.configured?
    ENV["ANTHROPIC_API_KEY"].present?
  end

  def self.reply(user:, messages:)
    new(user).reply(messages)
  end

  # Keyword search ranked by how many terms a book matches, so "funny time
  # travel" surfaces books hitting all three words before one-word matches.
  def self.search_catalog(raw_query)
    terms = raw_query.to_s.split(/\s+/).reject(&:blank?).first(TERM_LIMIT)
    return [] if terms.empty?

    binds = {}
    matchers = terms.each_with_index.map do |term, index|
      binds[:"term#{index}"] = "%#{ActiveRecord::Base.sanitize_sql_like(term)}%"
      "(title ILIKE :term#{index} OR author ILIKE :term#{index} OR description ILIKE :term#{index})"
    end

    score = matchers.map { |matcher| "(CASE WHEN #{matcher} THEN 1 ELSE 0 END)" }.join(" + ")
    order = ActiveRecord::Base.sanitize_sql_array([ "#{score} DESC", binds ])

    records = Book
      .where([ matchers.join(" OR "), binds ])
      .order(Arel.sql(order))
      .order(title: :asc, id: :asc)
      .limit(RESULT_LIMIT)
      .to_a
    counts = Checkout.active.where(book_id: records.map(&:id)).group(:book_id).count

    records.map do |book|
      active = counts.fetch(book.id, 0)

      {
        id: book.id,
        title: book.title,
        author: book.author,
        published_year: book.published_year,
        description: book.description&.truncate(DESCRIPTION_LIMIT),
        available: active < Checkout::BOOK_LIMIT
      }
    end
  end

  def initialize(user)
    @user = user
  end

  def reply(messages)
    final = nil

    Anthropic::Client.new.beta.messages.tool_runner(
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system_: system_prompt,
      tools: [ SearchBooks.new ],
      messages: messages
    ).each_message { |message| final = message }

    return FALLBACK_REPLY if final.nil? || final.stop_reason == :refusal

    text = final.content.filter_map { |block| block.text if block.type == :text }.join
    text.presence || FALLBACK_REPLY
  end

  private

  def system_prompt
    <<~PROMPT
      You are the librarian for a small online library. Readers ask you for their next book; you find it in the catalog and tell them why it fits.

      Rules:
      - Only recommend books returned by the search_books tool in this conversation. Never suggest a title you have not seen in a search result, even if you know it exists elsewhere.
      - For broad or thematic requests, run several searches with different single keywords before answering.
      - Recommend 1-3 books, each with a one-sentence reason. Mention when a book is currently unavailable (all copies checked out).
      - If nothing in the catalog fits, say so plainly and suggest a nearby theme to try — don't stretch a bad match.
      - Keep replies short and conversational. Plain text only, no markdown headings.
      - Politely decline questions unrelated to finding or discussing books in this library.

      #{reader_history}
    PROMPT
  end

  def reader_history
    checkouts = @user.checkouts.includes(:book).order(checked_out_at: :desc).limit(HISTORY_LIMIT)
    return "The reader has no checkout history yet." if checkouts.empty?

    lines = checkouts.map do |checkout|
      status = checkout.active? ? " (currently borrowed)" : ""
      %(- "#{checkout.book.title}" by #{checkout.book.author}#{status})
    end

    "The reader's recent checkouts, most recent first — useful for taste, and for avoiding re-recommending them:\n#{lines.join("\n")}"
  end
end
