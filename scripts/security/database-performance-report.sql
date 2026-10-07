-- Read-only evidence for advisor triage. Run with a catalog/statistics reader.
-- Save output at two representative workload windows. Do not reset statistics.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';

SELECT current_timestamp AS observed_at, datname, stats_reset
FROM pg_stat_database WHERE datname = current_database();

-- Zero scans is a review signal, not permission to remove an index. Constraint
-- indexes, replica identity and small tables are retained unless separately
-- justified by workload and plans.
SELECT s.schemaname, s.relname AS table_name, s.indexrelname AS index_name,
  s.idx_scan, s.idx_tup_read, s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
  i.indisprimary, i.indisunique, i.indisreplident,
  EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = s.indexrelid) AS backs_constraint,
  pg_get_indexdef(s.indexrelid) AS definition
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan, pg_relation_size(s.indexrelid) DESC, s.relname, s.indexrelname;

-- Compare exact duplicates without dropping them. Uniqueness, expressions,
-- ordering/opclasses, predicates and included columns are part of identity.
SELECT a.indrelid::regclass AS table_name,
  a.indexrelid::regclass AS first_index, b.indexrelid::regclass AS second_index,
  a.indisunique, a.indisprimary, b.indisprimary,
  a.indisreplident, b.indisreplident
FROM pg_index a JOIN pg_index b ON a.indrelid = b.indrelid AND a.indexrelid < b.indexrelid
WHERE a.indrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
  AND a.indisvalid AND b.indisvalid
  AND a.indisunique = b.indisunique
  AND a.indkey = b.indkey AND a.indclass = b.indclass
  AND a.indcollation = b.indcollation AND a.indoption = b.indoption
  AND a.indnatts = b.indnatts AND a.indnkeyatts = b.indnkeyatts
  AND a.indexprs::text IS NOT DISTINCT FROM b.indexprs::text
  AND a.indpred::text IS NOT DISTINCT FROM b.indpred::text
ORDER BY 1, 2;

-- Report leading-key coverage. A partial index is shown for human inspection:
-- IS NOT NULL often covers FK checks; stock_status/publication predicates may
-- exclude child rows and are not equivalent to full FK coverage.
SELECT c.conrelid::regclass AS table_name, c.conname AS foreign_key,
  ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
  CASE WHEN bool_or(i.indpred IS NULL AND i.indexrelid IS NOT NULL) THEN 'full index'
       WHEN count(i.indexrelid) > 0 THEN 'partial index: review predicate'
       ELSE 'no leading-key index' END AS coverage,
  array_remove(array_agg(pg_get_indexdef(i.indexrelid)), NULL) AS indexes,
  COALESCE(s.n_live_tup, 0) AS estimated_rows,
  COALESCE(s.seq_scan, 0) AS sequential_scans
FROM pg_constraint c
LEFT JOIN pg_index i ON i.indrelid = c.conrelid AND i.indisvalid AND i.indisready
  AND c.conkey <@ ARRAY(SELECT k.attnum FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
    WHERE k.ord <= cardinality(c.conkey))
LEFT JOIN pg_stat_user_tables s ON s.relid = c.conrelid
WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
GROUP BY c.oid, c.conrelid, c.conname, c.conkey, s.n_live_tup, s.seq_scan
ORDER BY coverage DESC, estimated_rows DESC, table_name, foreign_key;

-- Explicitly expand ALL policies and PUBLIC roles before comparing permissive
-- paths. This highlights intended portal/workspace OR paths as well as overlap.
WITH policies AS (
  SELECT p.schemaname, p.tablename, p.policyname, r.role_name, a.action,
    p.qual, p.with_check
  FROM pg_policies p CROSS JOIN LATERAL unnest(p.roles) r(role_name)
  CROSS JOIN LATERAL unnest(CASE WHEN p.cmd = 'ALL'
    THEN ARRAY['SELECT','INSERT','UPDATE','DELETE'] ELSE ARRAY[p.cmd] END) a(action)
  WHERE p.schemaname IN ('public','storage') AND p.permissive = 'PERMISSIVE'
), effective_roles AS (
  SELECT p.*, target.role_name AS effective_role
  FROM policies p CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) target(role_name)
  WHERE p.role_name = 'public' OR p.role_name = target.role_name
)
SELECT schemaname, tablename, effective_role, action,
  array_agg(DISTINCT policyname ORDER BY policyname) AS policies
FROM effective_roles GROUP BY schemaname, tablename, effective_role, action
HAVING count(DISTINCT policyname) > 1 ORDER BY 1, 2, 3, 4;
ROLLBACK;
