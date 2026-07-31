require "fileutils"

class BookContentStore
  class ContentMissing < StandardError; end

  def self.root
    Rails.root.join("storage", "library", "books")
  end

  def self.read(isbn)
    path = path_for(isbn)
    raise ContentMissing unless path.file?

    path.read
  end

  def self.write(isbn, content)
    FileUtils.mkdir_p(root)
    path_for(isbn).write(content)
  end

  def self.path_for(isbn)
    root.join("#{isbn}.txt")
  end
  private_class_method :path_for
end
