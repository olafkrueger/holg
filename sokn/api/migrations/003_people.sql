ALTER TABLE users ADD COLUMN name_custom INTEGER NOT NULL DEFAULT 0;

CREATE TABLE user_photos (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo BLOB NOT NULL
);

CREATE TABLE companions (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  photo BLOB
);
CREATE INDEX companions_owner ON companions(circle_id, owner_id);

CREATE TABLE visit_participants (
  visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT REFERENCES companions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  CHECK ((user_id IS NOT NULL) != (companion_id IS NOT NULL)),
  UNIQUE (visit_id, user_id),
  UNIQUE (visit_id, companion_id)
);
