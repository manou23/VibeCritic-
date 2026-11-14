-- Shared cache for reusable public-source API responses collected during review discovery.
CREATE TABLE IF NOT EXISTS source_cache (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  payload TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_cache_expiry ON source_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_source_cache_source ON source_cache(source, cached_at);
