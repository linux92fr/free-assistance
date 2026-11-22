-- Additive configuration storage for the site content and survey editor.
-- Existing survey_responses rows and their answers_json payloads are intentionally untouched.
CREATE TABLE IF NOT EXISTS site_content (
  content_key TEXT PRIMARY KEY,
  content_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS survey_configuration (
  id INTEGER PRIMARY KEY CHECK(id=1),
  config_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT
);
ALTER TABLE survey_configuration ADD COLUMN draft_json TEXT;
