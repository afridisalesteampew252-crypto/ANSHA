-- Phase 5: bounded admin reads and reversible catalog imports.

ALTER TABLE public.import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_status_check;
ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN ('processing', 'completed', 'completed_with_errors', 'failed', 'rolled_back'));

ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS target_table text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS previous_payload jsonb,
  ADD COLUMN IF NOT EXISTS post_import_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rollback_status text NOT NULL DEFAULT 'pending'
    CHECK (rollback_status IN ('pending', 'restored', 'deleted', 'skipped', 'failed'));

CREATE INDEX IF NOT EXISTS import_rows_job_rollback_idx
  ON public.import_rows (import_job_id, rollback_status, status);

CREATE OR REPLACE FUNCTION public.list_admin_customers(
  p_query text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_total integer;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.customers c
  WHERE v_query IS NULL OR concat_ws(' ', c.customer_code, c.full_name, c.company_name, c.email, c.phone, c.whatsapp, c.country, c.address, c.notes) ILIKE '%' || v_query || '%';

  RETURN jsonb_build_object(
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'has_more', v_total > v_page * v_page_size,
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC, row_data.id DESC)
      FROM (
        SELECT c.*
        FROM public.customers c
        WHERE v_query IS NULL OR concat_ws(' ', c.customer_code, c.full_name, c.company_name, c.email, c.phone, c.whatsapp, c.country, c.address, c.notes) ILIKE '%' || v_query || '%'
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
      ) row_data
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_import_job(p_import_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  job_row public.import_jobs%ROWTYPE;
  row_data record;
  restored_count integer := 0;
  deleted_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
  current_updated timestamptz;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  SELECT * INTO job_row FROM public.import_jobs WHERE id = p_import_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF job_row.status = 'rolled_back' THEN
    RETURN jsonb_build_object('restored', 0, 'deleted', 0, 'skipped', 0, 'failed', 0, 'status', 'rolled_back');
  END IF;
  IF job_row.status = 'processing' THEN RAISE EXCEPTION 'Wait for the import job to finish before rolling it back'; END IF;

  FOR row_data IN
    SELECT * FROM public.import_rows
    WHERE import_job_id = p_import_job_id AND status = 'success'
    ORDER BY row_number DESC
    FOR UPDATE
  LOOP
    BEGIN
      IF row_data.target_table NOT IN ('parts', 'vehicles') OR row_data.target_id IS NULL OR row_data.post_import_updated_at IS NULL THEN
        UPDATE public.import_rows SET rollback_status = 'skipped', message = COALESCE(message, 'No reversible target snapshot was stored') WHERE id = row_data.id;
        skipped_count := skipped_count + 1;
        CONTINUE;
      END IF;

      IF row_data.target_table = 'parts' THEN
        SELECT updated_at INTO current_updated FROM public.parts WHERE id = row_data.target_id FOR UPDATE;
        IF current_updated IS NULL OR current_updated IS DISTINCT FROM row_data.post_import_updated_at THEN
          UPDATE public.import_rows SET rollback_status = 'skipped', message = 'Skipped because the record changed after import' WHERE id = row_data.id;
          skipped_count := skipped_count + 1;
          CONTINUE;
        END IF;
        IF row_data.previous_payload IS NULL THEN
          DELETE FROM public.parts WHERE id = row_data.target_id;
          UPDATE public.import_rows SET rollback_status = 'deleted' WHERE id = row_data.id;
          deleted_count := deleted_count + 1;
        ELSE
          UPDATE public.parts SET
            part_code = row_data.previous_payload->>'part_code', name = row_data.previous_payload->>'name', slug = row_data.previous_payload->>'slug',
            brand = row_data.previous_payload->>'brand', part_number = row_data.previous_payload->>'part_number', oem_number = row_data.previous_payload->>'oem_number',
            condition = COALESCE(row_data.previous_payload->>'condition', 'used'), price = NULLIF(row_data.previous_payload->>'price', '')::numeric,
            currency = COALESCE(row_data.previous_payload->>'currency', 'USD'), quantity = COALESCE(NULLIF(row_data.previous_payload->>'quantity', '')::integer, 0),
            description = row_data.previous_payload->>'description', location = row_data.previous_payload->>'location',
            is_published = COALESCE(NULLIF(row_data.previous_payload->>'is_published', '')::boolean, false),
            is_featured = COALESCE(NULLIF(row_data.previous_payload->>'is_featured', '')::boolean, false),
            show_price = COALESCE(NULLIF(row_data.previous_payload->>'show_price', '')::boolean, false)
          WHERE id = row_data.target_id;
          UPDATE public.import_rows SET rollback_status = 'restored' WHERE id = row_data.id;
          restored_count := restored_count + 1;
        END IF;
      ELSE
        SELECT updated_at INTO current_updated FROM public.vehicles WHERE id = row_data.target_id FOR UPDATE;
        IF current_updated IS NULL OR current_updated IS DISTINCT FROM row_data.post_import_updated_at THEN
          UPDATE public.import_rows SET rollback_status = 'skipped', message = 'Skipped because the record changed after import' WHERE id = row_data.id;
          skipped_count := skipped_count + 1;
          CONTINUE;
        END IF;
        IF row_data.previous_payload IS NULL THEN
          DELETE FROM public.vehicles WHERE id = row_data.target_id;
          UPDATE public.import_rows SET rollback_status = 'deleted' WHERE id = row_data.id;
          deleted_count := deleted_count + 1;
        ELSE
          UPDATE public.vehicles SET
            chassis_number = row_data.previous_payload->>'chassis_number', stock_number = row_data.previous_payload->>'stock_number',
            title = row_data.previous_payload->>'title', slug = row_data.previous_payload->>'slug', make = row_data.previous_payload->>'make',
            model = row_data.previous_payload->>'model', variant = row_data.previous_payload->>'variant', year = NULLIF(row_data.previous_payload->>'year', '')::integer,
            chassis_code = row_data.previous_payload->>'chassis_code', engine_code = row_data.previous_payload->>'engine_code', transmission = row_data.previous_payload->>'transmission',
            fuel_type = row_data.previous_payload->>'fuel_type', mileage = NULLIF(row_data.previous_payload->>'mileage', '')::integer, color = row_data.previous_payload->>'color',
            price = NULLIF(row_data.previous_payload->>'price', '')::numeric, currency = COALESCE(row_data.previous_payload->>'currency', 'USD'),
            description = row_data.previous_payload->>'description', location = row_data.previous_payload->>'location',
            stock_origin = row_data.previous_payload->>'stock_origin', stock_pool = row_data.previous_payload->>'stock_pool',
            show_price = COALESCE(NULLIF(row_data.previous_payload->>'show_price', '')::boolean, false),
            is_published = COALESCE(NULLIF(row_data.previous_payload->>'is_published', '')::boolean, false),
            is_featured = COALESCE(NULLIF(row_data.previous_payload->>'is_featured', '')::boolean, false)
          WHERE id = row_data.target_id;
          UPDATE public.import_rows SET rollback_status = 'restored' WHERE id = row_data.id;
          restored_count := restored_count + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.import_rows SET rollback_status = 'failed', message = left(SQLERRM, 500) WHERE id = row_data.id;
      failed_count := failed_count + 1;
    END;
  END LOOP;

  UPDATE public.import_jobs SET status = CASE WHEN failed_count > 0 THEN 'completed_with_errors' ELSE 'rolled_back' END, error_summary = concat_ws('; ', error_summary, format('Rollback: %s restored, %s deleted, %s skipped, %s failed', restored_count, deleted_count, skipped_count, failed_count)), completed_at = COALESCE(completed_at, now()) WHERE id = p_import_job_id;
  RETURN jsonb_build_object('restored', restored_count, 'deleted', deleted_count, 'skipped', skipped_count, 'failed', failed_count, 'status', CASE WHEN failed_count > 0 THEN 'completed_with_errors' ELSE 'rolled_back' END);
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_customers(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_customers(text, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.rollback_import_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_import_job(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_admin_customers(text, integer, integer) IS 'Phase 5 bounded, role-safe CRM pagination with server-side search.';
COMMENT ON FUNCTION public.rollback_import_job(uuid) IS 'Phase 5 admin-only import rollback with optimistic concurrency protection.';
