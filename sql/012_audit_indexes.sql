-- Chạy trong Supabase SQL Editor để audit indexes + RLS hiệu năng.
-- READ-ONLY: chỉ select pg catalog, không sửa gì.

-- 1. Indexes hiện có trên các bảng quan trọng
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'lessons','audio_segments','flashcard_templates','vocab_cache',
    'exam_books','exam_units','exam_sections','exam_passages','exam_questions','exam_choices',
    'exam_results','user_flashcards','comments','posts','profiles'
  )
ORDER BY tablename, indexname;

-- 2. Foreign key columns WITHOUT indexes (potential slow JOINs)
SELECT
  tc.table_name AS table_name,
  kcu.column_name AS fk_column,
  ccu.table_name AS references_table,
  CASE
    WHEN i.indexname IS NULL THEN '❌ MISSING'
    ELSE '✓ ' || i.indexname
  END AS index_status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
LEFT JOIN pg_indexes i
  ON i.tablename = tc.table_name
  AND i.indexdef LIKE '%(' || kcu.column_name || ')%'
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- 3. Table sizes (heap + index)
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS data_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
