-- ============================================================
-- Aegis / Omkar Vault — Database Schema Migration
-- Run this SQL in Supabase SQL Editor or via CLI
-- ============================================================

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: vault_files
-- Stores metadata for every file uploaded to the vault.
-- The actual binary file is stored in Supabase Storage.
-- ============================================================
CREATE TABLE IF NOT EXISTS vault_files (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_name    TEXT        NOT NULL,
  storage_key      TEXT        NOT NULL UNIQUE,
  mime_type        TEXT        NOT NULL DEFAULT 'application/octet-stream',
  extension        TEXT        NOT NULL DEFAULT '',
  size_bytes       BIGINT      NOT NULL DEFAULT 0,
  category         TEXT        NOT NULL DEFAULT 'other'
                               CHECK (category IN ('document','presentation','image','spreadsheet','archive','other')),

  -- Presentation-specific fields (NULL for non-presentation files)
  slide_count      INTEGER,
  preview_status   TEXT        CHECK (preview_status IN ('processing','ready','failed')),
  preview_error    TEXT,
  presentation_meta JSONB,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for sorting / listing (most common query)
CREATE INDEX IF NOT EXISTS idx_vault_files_created_at ON vault_files (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_category    ON vault_files (category);
CREATE INDEX IF NOT EXISTS idx_vault_files_extension   ON vault_files (extension);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vault_files_updated_at ON vault_files;
CREATE TRIGGER vault_files_updated_at
  BEFORE UPDATE ON vault_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- The vault uses a server-side admin client (service role key)
-- that bypasses RLS. RLS is still enabled as a safety net.
-- Public / anonymous access is completely blocked.
-- ============================================================
ALTER TABLE vault_files ENABLE ROW LEVEL SECURITY;

-- No public policies — all access goes through the server-side admin client.
-- If you ever need to add authenticated Supabase Auth policies, add them here.

-- ============================================================
-- Storage bucket policies (run in Supabase Storage settings
-- or via this SQL — adjust as needed for your Supabase version)
-- ============================================================
-- NOTE: Supabase Storage RLS policies for the 'omkarvault' bucket
-- should be configured in the Storage section of the Supabase dashboard:
--   1. Bucket: omkarvault
--   2. Make it PRIVATE (not public)
--   3. No policies needed — the server-side service role key bypasses all RLS
-- ============================================================
