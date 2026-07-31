class User < ApplicationRecord
  has_secure_password
  has_many :checkouts, dependent: :destroy
  has_many :books, through: :checkouts

  before_validation :normalize_email

  validates :email,
    presence: true,
    format: { with: URI::MailTo::EMAIL_REGEXP },
    uniqueness: { case_sensitive: false }

  private

  def normalize_email
    self.email = email.to_s.strip.downcase
  end
end
