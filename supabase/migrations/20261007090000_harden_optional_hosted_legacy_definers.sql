-- Hosted-only legacy routines were found in the production catalog after the
-- historical migration/name reconciliation. They are absent from fresh clones.
-- Their application tables/helpers are fully schema-qualified; pg_catalog
-- functions remain available with an empty search path. Preserve the existing
-- active-workspace contract and typed return values for these compatibility APIs.
DO $$
DECLARE
  signature text;
  routine regprocedure;
  definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.recalc_purchase_order_total(uuid)',
    'private.trg_audit_lifecycle_stage()',
    'private.trg_audit_row_change()',
    'private.trg_po_items_recalc()',
    'public.delete_vehicle_lifecycle_attachment(uuid)',
    'public.register_vehicle_lifecycle_attachment(uuid,text,text,text,bigint)',
    'public.record_outbound_message(text,text,text,text,text,text,text,text,jsonb)',
    'public.write_audit_log(text,text,uuid,text,jsonb)'
  ] LOOP
    routine := to_regprocedure(signature);
    IF routine IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', routine, '');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', routine);
    IF signature LIKE 'private.%' THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', routine);
    END IF;
  END LOOP;

  routine := to_regprocedure('public.record_outbound_message(text,text,text,text,text,text,text,text,jsonb)');
  IF routine IS NOT NULL THEN
    SELECT pg_get_functiondef(routine) INTO definition;
    -- This optional API already rejects a missing workspace profile. Make the
    -- corresponding identity requirement explicit before inserting an audit or
    -- outbound record; repeated execution is idempotent.
    definition := replace(
      definition,
      'IF NOT private.is_workspace_user() THEN RAISE EXCEPTION ''Workspace access required''; END IF;',
      'IF actor IS NULL OR NOT private.is_workspace_user() THEN RAISE EXCEPTION ''Workspace access required'' USING ERRCODE = ''42501''; END IF;'
    );
    EXECUTE definition;
  END IF;
END;
$$;
