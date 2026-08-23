-- ═══════════════════════════════════════════════════════════════════════════
-- HANDWRITING REPORTS — Schema Migration
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS handwriting_reports (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  submission_id     UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','completed','failed','manual_review')),

  -- Per-question evaluation results (JSONB array)
  question_results  JSONB DEFAULT '[]'::jsonb,

  -- Overall summary
  total_marks       NUMERIC,
  max_marks         NUMERIC,
  overall_percentage NUMERIC,
  performance_level TEXT,
  strong_areas      JSONB DEFAULT '[]'::jsonb,
  weak_areas        JSONB DEFAULT '[]'::jsonb,
  suggestions       JSONB DEFAULT '[]'::jsonb,

  -- OCR metadata
  ocr_confidence    NUMERIC,
  pages_processed   INTEGER DEFAULT 0,

  -- Teacher override
  teacher_modified  BOOLEAN DEFAULT FALSE,
  teacher_notes     TEXT,
  finalized         BOOLEAN DEFAULT FALSE,
  finalized_by      UUID REFERENCES users(id),
  finalized_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submission_id)
);

-- Auto-update updated_at on row change
DROP TRIGGER IF EXISTS trg_handwriting_reports_updated_at ON handwriting_reports;
CREATE TRIGGER trg_handwriting_reports_updated_at
  BEFORE UPDATE ON handwriting_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_handwriting_reports_submission
  ON handwriting_reports(submission_id);
CREATE INDEX IF NOT EXISTS idx_handwriting_reports_status
  ON handwriting_reports(status);
