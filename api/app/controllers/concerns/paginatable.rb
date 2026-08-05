module Paginatable
  extend ActiveSupport::Concern

  PER_PAGE_DEFAULT = 24
  PER_PAGE_MAX = 100
  # An unbounded page becomes an OFFSET larger than Postgres' bigint and
  # 500s the request (found by Schemathesis); clamp far beyond any real page.
  PAGE_MAX = 10_000_000
  QUERY_MAX_LENGTH = 100

  private

  # Returns [paginated_scope, meta]. `page`/`per_page` are coerced through
  # scalar_param so array/hash params (Rack bracket syntax like ?page[]=1)
  # can never reach Integer#to_i on a non-scalar and 500 the request.
  def paginate(relation, default_per_page: PER_PAGE_DEFAULT)
    total_count = relation.count
    total_count = total_count.size if total_count.is_a?(Hash) # grouped relations count into a hash

    page = scalar_param(:page).to_i.clamp(1, PAGE_MAX)
    per_page = scalar_param(:per_page).to_i
    per_page = default_per_page unless per_page.positive?
    per_page = [ per_page, PER_PAGE_MAX ].min
    total_pages = (total_count.to_f / per_page).ceil

    scope = relation.offset((page - 1) * per_page).limit(per_page)
    meta = { page: page, per_page: per_page, total_pages: total_pages, total_count: total_count }

    [ scope, meta ]
  end

  # A search term bounded in length: an unbounded ILIKE '%...%' is an
  # index-less sequential scan, so a long term is a cheap DoS.
  def bounded_query
    scalar_param(:query).first(QUERY_MAX_LENGTH)
  end

  # Coerces a param to a String regardless of what Rack parsed it into
  # (String, Array, or ActionController::Parameters), so downstream
  # numeric/string operations never crash on a non-scalar.
  def scalar_param(key)
    value = params[key]
    value.is_a?(String) ? value : value.to_s
  end
end
