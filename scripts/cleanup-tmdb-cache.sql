DELETE FROM titles WHERE julianday(updated_at) < julianday('now', '-179 days');
DELETE FROM people WHERE NOT EXISTS (SELECT 1 FROM credits WHERE credits.person_id = people.id);
DELETE FROM genres WHERE NOT EXISTS (SELECT 1 FROM title_genres WHERE title_genres.genre_id = genres.id);
