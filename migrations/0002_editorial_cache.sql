-- Persistent, bounded cache for editorial enrichment collected during the scheduled catalog sync.
CREATE TABLE IF NOT EXISTS editorial_cache (
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  payload TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tmdb_id, type)
);
CREATE INDEX IF NOT EXISTS idx_editorial_cache_expiry ON editorial_cache(expires_at);
