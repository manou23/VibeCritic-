CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_slug TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 2 AND 32),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 8 AND 700),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_review_status_created
ON comments (review_slug, status, created_at DESC);
