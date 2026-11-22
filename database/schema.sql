-- FO Free Distributions: initial PostgreSQL schema
-- Run once in the Neon SQL Editor on the production branch.

CREATE TABLE IF NOT EXISTS articles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  excerpt VARCHAR(320),
  content TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  category VARCHAR(80) NOT NULL DEFAULT 'Actualités',
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS articles_publication_idx
  ON articles (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS articles_status_updated_idx
  ON articles (status, updated_at DESC);
