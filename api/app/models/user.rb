class User < ApplicationRecord
  has_secure_password
  has_many :checkouts, dependent: :destroy
  has_many :books, through: :checkouts

  before_validation :normalize_email

  validates :email,
    presence: true,
    format: { with: URI::MailTo::EMAIL_REGEXP },
    uniqueness: { case_sensitive: false }

  # has_secure_password enforces presence and the 72-byte bcrypt ceiling; add a
  # floor so trivially guessable passwords can't be set. Only validated when a
  # password is being set, so it doesn't block unrelated updates.
  validates :password, length: { minimum: 8 }, if: -> { password.present? }

  private

  def normalize_email
    self.email = email.to_s.strip.downcase
  end
end
