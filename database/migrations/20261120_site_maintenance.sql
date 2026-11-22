-- Scheduled public maintenance controls for FO Free Distribution.
CREATE TABLE IF NOT EXISTS site_maintenance (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  starts_at TEXT,
  ends_at TEXT,
  message TEXT NOT NULL DEFAULT 'Nous effectuons actuellement une maintenance programmée. Merci de revenir un peu plus tard.',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT
);
