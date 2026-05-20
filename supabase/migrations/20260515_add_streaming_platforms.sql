-- Streaming Platforms support

CREATE TABLE IF NOT EXISTS streaming_platforms (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT
);

CREATE TABLE IF NOT EXISTS title_streaming_platforms (
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES streaming_platforms(id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, platform_id)
);

-- Insert major platforms
INSERT INTO streaming_platforms (name, slug, logo_url) VALUES
  ('Netflix', 'netflix', 'https://image.tmdb.org/t/p/original/pbsl3IQ5i0MmsDMHd6DPL+BjrC4.png'),
  ('Prime Video', 'prime', 'https://image.tmdb.org/t/p/original/emjicEaElbaUvVQu8aWRfz7P6ia.png'),
  ('Disney+', 'disney', 'https://image.tmdb.org/t/p/original/6P8rQW58BYhkVKnQlrXVVWmKwTf.png'),
  ('Apple TV+', 'appletv', 'https://image.tmdb.org/t/p/original/fryOnlEhWEYd2v8kG2yD6Oa6g9.png'),
  ('Hulu', 'hulu', 'https://image.tmdb.org/t/p/original/wUBwvH6QsNcaMvAMpjBAFdLYZFz.png'),
  ('Max', 'max', 'https://image.tmdb.org/t/p/original/nUXn3oaNwZe3ZG4FGVX6gENALBi.png'),
  ('Paramount+', 'paramount', 'https://image.tmdb.org/t/p/original/Ajb778zsKDhead1pWYIgaLe1.png'),
  ('Peacock', 'peacock', 'https://image.tmdb.org/t/p/original/rNpqLVU0MgLo7n9gLYb0z3IBxS8.png'),
  ('Roku Channel', 'roku', 'https://image.tmdb.org/t/p/original/wXtFT65PmXKtKGe3dEfOY9xVf0A.png'),
  ('YouTube', 'youtube', 'https://image.tmdb.org/t/p/original/icDKy7IakVG8qBb6qXMVyl7Bpap.png')
ON CONFLICT (name) DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_title_streaming_platforms_title_id ON title_streaming_platforms(title_id);
CREATE INDEX IF NOT EXISTS idx_title_streaming_platforms_platform_id ON title_streaming_platforms(platform_id);

-- Grant permissions
GRANT SELECT ON streaming_platforms TO anon, authenticated;
GRANT SELECT ON title_streaming_platforms TO anon, authenticated;
