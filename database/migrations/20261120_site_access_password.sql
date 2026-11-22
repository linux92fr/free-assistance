-- Store the shared site-access password as a salted PBKDF2 hash.
CREATE TABLE IF NOT EXISTS site_access_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 310000,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Rate-limit failed shared-password logins without retaining raw IP addresses.
CREATE TABLE IF NOT EXISTS site_access_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);