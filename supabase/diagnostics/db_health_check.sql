-- ============================================================================
-- DEVCON+ Database Health Check — read-only diagnostic pack
-- Run in the Supabase SQL editor (or via the read-only Supabase MCP).
-- Purpose: confirm the real query bottleneck before adding indexes, and produce
--          the authoritative current index list to dedup new indexes against.
-- Safe to run on production: every statement is read-only.
-- ============================================================================

-- 0. Ensure pg_stat_statements is available (Supabase ships it; this just confirms).
--    If this returns 0 rows, enable it: Dashboard → Database → Extensions → pg_stat_statements.
SELECT count(*) AS pg_stat_statements_installed
FROM pg_extension WHERE extname = 'pg_stat_statements';

-- 1. TOP QUERIES BY TOTAL TIME — the single most useful view.
--    Normalize/aggregate the heaviest statements the DB actually spends time on.
SELECT
  calls,
  round(total_exec_time::numeric, 1)            AS total_ms,
  round(mean_exec_time::numeric, 2)             AS mean_ms,
  rows,
  round((100 * total_exec_time / NULLIF(sum(total_exec_time) OVER (), 0))::numeric, 1) AS pct_total,
  query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 25;

-- 2. SEQUENTIAL-SCAN HEAVY TABLES — missing-index heuristic.
--    High seq_tup_read with large n_live_tup and low idx_scan = candidate for an index.
SELECT
  relname,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup,
  seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
ORDER BY seq_tup_read DESC
LIMIT 25;

-- 3. UNUSED / REDUNDANT INDEXES — these only cost write throughput + bloat.
SELECT
  relname            AS table_name,
  indexrelname       AS index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 4. CURRENT INDEX INVENTORY — DEDUP SOURCE.
--    Diff every proposed new index against this list BEFORE applying the migration.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. TABLE + INDEX SIZES — where the data actually lives.
SELECT
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid))       AS table_size,
  pg_size_pretty(pg_indexes_size(relid))        AS indexes_size,
  n_live_tup
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;

-- 6. CACHE HIT RATIO — should be > 0.99. Low ⇒ working set doesn't fit RAM
--    (under-provisioned compute, not a missing index).
SELECT
  round(sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)::numeric, 4) AS heap_cache_hit_ratio
FROM pg_statio_user_tables;

-- 7. CONNECTION PRESSURE — is the pool saturated?
SELECT state, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count(*) DESC;

-- 8. LONGEST CURRENTLY-RUNNING / IDLE-IN-TRANSACTION queries (lock/pressure check).
SELECT
  pid,
  state,
  round(extract(epoch FROM (now() - query_start))::numeric, 1) AS age_seconds,
  wait_event_type,
  left(query, 120) AS query_preview
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
ORDER BY query_start ASC NULLS LAST
LIMIT 20;

-- ── Targeted EXPLAINs (run individually; substitute a real user id) ──────────
-- Points history (Phase 2 candidate — currently unbounded):
-- EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM point_transactions WHERE user_id = '<uuid>' ORDER BY created_at DESC;
--
-- Mission per-user reads (Phase 1 candidate):
-- EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM mission_submissions WHERE user_id = '<uuid>';
-- EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM mission_submissions WHERE status = 'pending' ORDER BY submitted_at ASC;
