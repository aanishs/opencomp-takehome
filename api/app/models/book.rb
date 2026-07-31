class Book < ApplicationRecord
  has_many :checkouts, dependent: :destroy

  validates :title, :author, :isbn, presence: true
end
