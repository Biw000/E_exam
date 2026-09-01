"""
Schema migration runner.

`Base.metadata.create_all()` in main.py can only CREATE new tables - it will
never ALTER an existing one. Since the tables already exist in production,
every schema change from here on has to go through this script.

Run it once after deploying new code:

    python migrate.py

It is idempotent: running it twice is harmless. It never drops a table and
never deletes a row.

Changes applied:
  1. face_embeddings.pose_type      - new column, so one user can store
                                      several embeddings (CENTER/LEFT/RIGHT/UP/DOWN)
  2. face_embeddings                - drop the UNIQUE(user_id) constraint that
                                      limited each user to a single embedding,
                                      replace with UNIQUE(user_id, pose_type)
  3. suspicious_events.event_type   - postgres ENUM -> varchar(50), so new event
                                      types can be added in Python without an
                                      ALTER TYPE migration every time
  4. suspicious_events.severity     - new column (INFO / WARNING / SUSPICIOUS)
  5. suspicious_events.event_metadata - new JSONB column for head pose data etc.
"""
import sys

from sqlalchemy import create_engine, text

from app.config import settings

db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(db_url, pool_pre_ping=True)


def log(message: str) -> None:
    print(f"  {message}", flush=True)


def migrate() -> None:
    with engine.begin() as conn:
        # ------------------------------------------------------------------
        # Guard: if the tables do not exist yet, there is nothing to migrate.
        # main.py will create them with the new definitions on next startup.
        # ------------------------------------------------------------------
        tables_exist = conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' "
                "AND table_name IN ('face_embeddings', 'suspicious_events')"
            )
        ).scalar()

        if tables_exist == 0:
            log("Tables do not exist yet - nothing to migrate.")
            log("Start the app once so create_all() builds them, then re-run.")
            return

        # ------------------------------------------------------------------
        # 1. face_embeddings.pose_type
        # ------------------------------------------------------------------
        log("1/5  face_embeddings.pose_type")
        conn.execute(
            text(
                "ALTER TABLE face_embeddings "
                "ADD COLUMN IF NOT EXISTS pose_type VARCHAR(16) NOT NULL DEFAULT 'CENTER'"
            )
        )

        # ------------------------------------------------------------------
        # 2. Drop UNIQUE(user_id), add UNIQUE(user_id, pose_type)
        #    The old constraint name is auto-generated, so look it up.
        # ------------------------------------------------------------------
        log("2/5  face_embeddings unique constraint")
        old_constraints = conn.execute(
            text(
                """
                SELECT tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_name = 'face_embeddings'
                  AND tc.constraint_type = 'UNIQUE'
                GROUP BY tc.constraint_name
                HAVING COUNT(kcu.column_name) = 1
                   AND MIN(kcu.column_name) = 'user_id'
                """
            )
        ).fetchall()

        for (name,) in old_constraints:
            conn.execute(text(f'ALTER TABLE face_embeddings DROP CONSTRAINT "{name}"'))
            log(f"     dropped {name}")

        # A plain unique index on user_id may also exist separately.
        unique_indexes = conn.execute(
            text(
                """
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'face_embeddings'
                  AND indexdef LIKE '%UNIQUE%'
                  AND indexdef LIKE '%(user_id)%'
                """
            )
        ).fetchall()
        for (name,) in unique_indexes:
            conn.execute(text(f'DROP INDEX IF EXISTS "{name}"'))
            log(f"     dropped index {name}")

        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_face_embeddings_user_pose "
                "ON face_embeddings (user_id, pose_type)"
            )
        )

        # ------------------------------------------------------------------
        # 3. suspicious_events.event_type : ENUM -> VARCHAR(50)
        # ------------------------------------------------------------------
        log("3/5  suspicious_events.event_type -> varchar")
        current_type = conn.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'suspicious_events' AND column_name = 'event_type'"
            )
        ).scalar()

        if current_type != "character varying":
            conn.execute(
                text(
                    "ALTER TABLE suspicious_events "
                    "ALTER COLUMN event_type TYPE VARCHAR(50) "
                    "USING event_type::text"
                )
            )
            log("     converted from enum")
        else:
            log("     already varchar")

        # The now-orphaned enum type can be removed. Ignore failure: another
        # column somewhere might still reference it.
        try:
            conn.execute(text("DROP TYPE IF EXISTS suspiciouseventtype"))
        except Exception:
            pass

        # ------------------------------------------------------------------
        # 4. suspicious_events.severity
        # ------------------------------------------------------------------
        log("4/5  suspicious_events.severity")
        conn.execute(
            text(
                "ALTER TABLE suspicious_events "
                "ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'INFO'"
            )
        )

        # Backfill severity for rows written before this column existed.
        conn.execute(
            text(
                """
                UPDATE suspicious_events SET severity = 'SUSPICIOUS'
                WHERE severity = 'INFO'
                  AND event_type IN ('MULTIPLE_FACES', 'FACE_MISMATCH')
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE suspicious_events SET severity = 'WARNING'
                WHERE severity = 'INFO'
                  AND event_type IN ('NO_FACE', 'TAB_SWITCH', 'FULLSCREEN_EXIT', 'CAMERA_DISABLED')
                """
            )
        )

        # ------------------------------------------------------------------
        # 5. suspicious_events.event_metadata
        # ------------------------------------------------------------------
        log("5/5  suspicious_events.event_metadata")
        conn.execute(
            text("ALTER TABLE suspicious_events ADD COLUMN IF NOT EXISTS event_metadata JSONB")
        )

        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_suspicious_events_severity "
                "ON suspicious_events (severity)"
            )
        )


if __name__ == "__main__":
    print("Running E-Exam schema migration...", flush=True)
    try:
        migrate()
    except Exception as exc:  # noqa: BLE001 - top-level script, show the error
        print(f"\nMigration FAILED: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
    print("Migration complete.", flush=True)
