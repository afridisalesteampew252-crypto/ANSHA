BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(15);

SELECT extensions.is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) setting
          WHERE setting LIKE 'search_path=%'
        )
        OR EXISTS (
          SELECT 1 FROM unnest(p.proconfig) setting
          WHERE setting LIKE 'search_path=%'
            AND replace(setting, 'search_path=', '') NOT IN ('', '""')
        )
      )
  ),
  0::bigint,
  'all application SECURITY DEFINER functions use an empty search_path'
);

SELECT extensions.is(
  (
    SELECT array_agg(p.oid::regprocedure ORDER BY p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  (
    SELECT array_agg(entry ORDER BY entry::oid)
    FROM unnest(ARRAY[
      'public.verify_invoice(uuid)'::regprocedure,
      'public.submit_sales_inquiry(text,text,text,text,uuid,uuid,text,text)'::regprocedure
    ]) entry
  ),
  'anonymous SECURITY DEFINER allowlist is exactly invoice verification and validated sales inquiry intake'
);

SELECT extensions.ok(
  has_function_privilege('anon', 'public.verify_invoice(uuid)', 'EXECUTE'),
  'anonymous invoice QR verification remains available'
);
SELECT extensions.ok(
  NOT has_function_privilege('authenticated', 'public.verify_invoice(uuid)', 'EXECUTE'),
  'authenticated does not inherit the anonymous invoice verifier grant'
);
SELECT extensions.ok(
  has_function_privilege('authenticated', 'public.register_fcm_push_token(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.register_fcm_push_token(text,text)', 'EXECUTE'),
  'FCM registration is authenticated-only'
);
SELECT extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.register_push_subscription(text,text,text,boolean,boolean,boolean,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.register_push_subscription(text,text,text,boolean,boolean,boolean,text)',
    'EXECUTE'
  ),
  'browser push registration is authenticated-only'
);

SELECT extensions.is(
  (SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'workspace_select_customers'),
  ARRAY['authenticated']::name[],
  'customer workspace SELECT policy is authenticated-only'
);
SELECT extensions.is(
  (SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'receivables_read_invoices'),
  ARRAY['authenticated']::name[],
  'invoice workspace SELECT policy is authenticated-only'
);
SELECT extensions.is(
  (SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_items' AND policyname = 'receivables_read_invoice_items'),
  ARRAY['authenticated']::name[],
  'invoice-item workspace SELECT policy is authenticated-only'
);

SELECT extensions.ok(
  (SELECT qual LIKE '%is_manager%' AND qual LIKE '%owner_id%auth.uid%'
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'workspace_select_customers'),
  'manager customer visibility is owner-scoped'
);
SELECT extensions.ok(
  (SELECT qual LIKE '%is_manager%' AND qual LIKE '%owner_id%auth.uid%'
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'receivables_read_invoices'),
  'manager invoice visibility is owner-scoped'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'guard_vehicle_reservation_scope' AND NOT tgisinternal
  ),
  'vehicle reservations have an ownership guard trigger'
);
SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'guard_part_reservation_scope' AND NOT tgisinternal
  ),
  'part reservations have an ownership guard trigger'
);

SELECT extensions.ok(
  pg_get_functiondef('public.set_vehicle_public_listing(uuid,boolean)'::regprocedure)
    LIKE '%private.is_ops_user%'
  AND pg_get_functiondef('public.set_vehicle_public_listing(uuid,boolean)'::regprocedure)
    LIKE '%private.can_access_stock_origin%',
  'public listing mutation requires ops or manager origin access'
);
SELECT extensions.ok(
  pg_get_functiondef('public.apply_invoice_stock(uuid)'::regprocedure)
    LIKE '%private.can_manage_receivables%',
  'invoice stock application requires receivables access'
);

SELECT * FROM extensions.finish();

ROLLBACK;
