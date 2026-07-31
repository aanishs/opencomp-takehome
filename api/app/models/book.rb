class Book < ApplicationRecord
  has_many :checkouts, dependent: :destroy

  validates :title, :author, :isbn, presence: true
  validates :isbn, format: { with: /\A[0-9Xx-]+\z/ }
end
