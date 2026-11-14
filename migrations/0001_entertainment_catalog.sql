-- VibeCritic entertainment catalog schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  title_ar TEXT,
  overview_ar TEXT,
  release_date TEXT,
  year INTEGER,
  runtime INTEGER,
  status TEXT,
  rating REAL,
  votes INTEGER,
  popularity REAL,
  poster_path TEXT,
  backdrop_path TEXT,
  original_language TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (tmdb_id, type)
);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  poster_path TEXT,
  air_date TEXT,
  UNIQUE (title_id, season_number)
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  still_path TEXT,
  air_date TEXT,
  runtime INTEGER,
  rating REAL,
  UNIQUE (season_id, episode_number)
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  tmdb_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_path TEXT,
  biography TEXT,
  birthday TEXT
);

CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  kind TEXT NOT NULL CHECK (kind IN ('cast', 'crew')),
  character TEXT,
  job TEXT,
  sort_order INTEGER,
  UNIQUE (title_id, person_id, kind, character, job)
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name_ar TEXT,
  name_en TEXT
);

CREATE TABLE IF NOT EXISTS title_genres (
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_titles_filter ON titles(type, year, rating);
CREATE INDEX IF NOT EXISTS idx_titles_popularity ON titles(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_credits_title ON credits(title_id);
CREATE INDEX IF NOT EXISTS idx_credits_person ON credits(person_id);
CREATE INDEX IF NOT EXISTS idx_seasons_title ON seasons(title_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id);

CREATE VIRTUAL TABLE IF NOT EXISTS titles_fts USING fts5(
  title,
  title_ar,
  overview_ar,
  content='titles',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS titles_ai AFTER INSERT ON titles BEGIN
  INSERT INTO titles_fts(rowid, title, title_ar, overview_ar)
  VALUES (new.id, new.title, new.title_ar, new.overview_ar);
END;

CREATE TRIGGER IF NOT EXISTS titles_ad AFTER DELETE ON titles BEGIN
  INSERT INTO titles_fts(titles_fts, rowid, title, title_ar, overview_ar)
  VALUES ('delete', old.id, old.title, old.title_ar, old.overview_ar);
END;

CREATE TRIGGER IF NOT EXISTS titles_au AFTER UPDATE ON titles BEGIN
  INSERT INTO titles_fts(titles_fts, rowid, title, title_ar, overview_ar)
  VALUES ('delete', old.id, old.title, old.title_ar, old.overview_ar);
  INSERT INTO titles_fts(rowid, title, title_ar, overview_ar)
  VALUES (new.id, new.title, new.title_ar, new.overview_ar);
END;
