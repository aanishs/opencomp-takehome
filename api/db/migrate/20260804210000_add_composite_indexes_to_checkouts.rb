class AddCompositeIndexesToCheckouts < ActiveRecord::Migration[8.1]
  def change
    add_index :checkouts, [ :book_id, :expires_at ]
    add_index :checkouts, [ :user_id, :expires_at ]
  end
end
