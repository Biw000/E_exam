-- =====================================================================
-- Migration 001 — Multi-pose face enrollment + extended suspicious events
--
-- SAFE TO RE-RUN. Does not drop tables and does not delete any rows.
--
-- Why this file exists:
--   app/main.py uses Base.metadata.create_all(), which only CREATES
--   missing tables. It never ALTERs an existing table. The tables are
--   already live on Render, so every schema change below must be applied
--   by hand (or by a migration tool) exactly once.
--
-- How to run:
--   Render Dashboard -> eexam-db -> Connect -> PSQL Command
--   then paste this file, or:
--     psql "<External Database URL>" -f migrations/001_multipose_and_events.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. face_embeddings: allow several embeddings per user (one per pose)
-- ---------------------------------------------------------------------

ALTER TABLE face_embeddings
    ADD COLUMN IF NOT EXISTS pose_type VARCHAR(20) NOT NULL DEFAULT 'CENTER';

ALTER TABLE face_embeddings
    ADD COLUMN IF NOT EXISTS quality DOUBLE PRECISION;

-- The original model declared user_id as unique=True, which caps each user
-- at a single embedding. Drop whichever form Postgres created (constraint
-- or unique index), while carefully leaving the primary key alone.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'face_embeddings'
          AND con.contype = 'u'
    LOOP
        EXECUTE format('ALTER TABLE face_embeddings DROP CONSTRAINT %I', r.conname);
    END LOOP;

    FOR r IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'face_embeddings'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(user_id)%'
          AND indexname NOT LIKE '%_pkey'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
    END LOOP;
END $$;

-- Plain lookup index (non-unique) for "all embeddings of this user".
CREATE INDEX IF NOT EXISTS ix_face_embeddings_user_id
    ON face_embeddings (user_id);

-- One row per (user, pose) so re-enrolling a pose updates instead of piling up.
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_embeddings_user_pose
    ON face_embeddings (user_id, pose_type);


-- ---------------------------------------------------------------------
-- 2. suspicious_events: text event_type + severity + metadata
--
-- event_type was a Postgres ENUM. Every new event name would then need an
-- ALTER TYPE ... ADD VALUE, which cannot run inside a transaction block in
-- older Postgres and is easy to forget. Converting to VARCHAR moves the
-- allowed-values check into Pydantic, where it belongs.
-- ---------------------------------------------------------------------

ALTER TABLE suspicious_events
    ALTER COLUMN event_type TYPE VARCHAR(40) USING event_type::text;

ALTER TABLE suspicious_events
    ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'INFO';

ALTER TABLE suspicious_events
    ADD COLUMN IF NOT EXISTS event_metadata JSONB;

-- Backfill severity for rows written before this column existed.
UPDATE suspicious_events
SET severity = CASE
    WHEN event_type IN ('MULTIPLE_FACES', 'FACE_MISMATCH', 'CAMERA_DISABLED') THEN 'SUSPICIOUS'
    WHEN event_type IN ('NO_FACE', 'TAB_SWITCH', 'FULLSCREEN_EXIT')           THEN 'WARNING'
    ELSE 'INFO'
END
WHERE severity = 'INFO'
  AND event_type <> 'FACE_OK';

CREATE INDEX IF NOT EXISTS ix_suspicious_events_severity
    ON suspicious_events (severity);

CREATE INDEX IF NOT EXISTS ix_suspicious_events_attempt_created
    ON suspicious_events (attempt_id, created_at DESC);

COMMIT;

-- The old enum type is now unreferenced. It is left in place on purpose:
-- dropping it adds a failure mode for zero benefit. If you want it gone,
-- run this separately once you have confirmed the app is healthy:
--     DROP TYPE IF EXISTS suspiciouseventtype;
