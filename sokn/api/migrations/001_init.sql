CREATE TABLE users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, subject)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  next_path TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
