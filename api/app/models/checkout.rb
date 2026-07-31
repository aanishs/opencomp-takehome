class Checkout < ApplicationRecord
  belongs_to :user
  belongs_to :book

  scope :active, -> { where("expires_at > ?", Time.current) }
end
