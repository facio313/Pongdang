"""Additive refresh queue; invoked only by explicit schema initialization."""


def migrate_refresh(connection):
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.collection_refresh_request ("
        "request_id uuid PRIMARY KEY, requested_at timestamptz NOT NULL DEFAULT now(),"
        "started_at timestamptz, finished_at timestamptz, "
        "status text NOT NULL DEFAULT 'queued' CHECK (status IN "
        "('queued','running','succeeded','partial','failed')), "
        "failed_jobs jsonb NOT NULL DEFAULT '[]'::jsonb)"
    )
    connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS collection_refresh_active_idx "
        "ON pongdang_data.collection_refresh_request ((true)) "
        "WHERE status IN ('queued','running')"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.collection_refresh_task ("
        "request_id uuid NOT NULL REFERENCES "
        "pongdang_data.collection_refresh_request(request_id) ON DELETE CASCADE, "
        "task_name text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK "
        "(state IN ('pending','running','succeeded','partial','no_data','failed')), "
        "not_before timestamptz NOT NULL, finished_at timestamptz, "
        "PRIMARY KEY(request_id,task_name))"
    )
