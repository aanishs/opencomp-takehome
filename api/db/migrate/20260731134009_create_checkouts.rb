class CreateCheckouts < ActiveRecord::Migration[8.1]
  def change
    create_table :checkouts do |t|
      t.references :user, null: false, foreign_key: true
      t.references :book, null: false, foreign_key: true
      t.datetime :checked_out_at, null: false
      t.datetime :expires_at, null: false

      t.timestamps
    end
  end
end
