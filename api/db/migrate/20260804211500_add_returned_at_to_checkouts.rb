class AddReturnedAtToCheckouts < ActiveRecord::Migration[8.1]
  def change
    add_column :checkouts, :returned_at, :datetime

    # Active-checkout queries filter on returned_at IS NULL, so the composite
    # indexes become partial; the single-column indexes stay for history and
    # foreign-key lookups, which include returned rows.
    remove_index :checkouts, [ :book_id, :expires_at ]
    remove_index :checkouts, [ :user_id, :expires_at ]
    add_index :checkouts, [ :book_id, :expires_at ], where: "returned_at IS NULL"
    add_index :checkouts, [ :user_id, :expires_at ], where: "returned_at IS NULL"
  end
end
