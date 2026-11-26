CREATE TABLE circles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo TEXT,
  photo_type TEXT,
  visitor_slug TEXT NOT NULL UNIQUE,
  admin_slug_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE memberships (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin','visitor','holger')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(circle_id,user_id)
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE pairings (
  token_hash TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  template TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX visits_circle_date ON visits(circle_id,date);
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'de',
  UNIQUE(circle_id,endpoint)
);
