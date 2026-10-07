-- Fix PL/pgSQL name collision between the local fallback currency and query columns.
-- The function may already be corrected in a live environment; replacements are idempotent.
DO $migration$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_my_customer_soa()'::regprocedure)
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'public.get_my_customer_soa() was not found';
  END IF;

  -- Anchor the complete declaration: matching the suffix of an already fixed
  -- default_currency would incorrectly rename it to default_default_currency.
  -- Fresh PL/pgSQL bodies also retain the declaration without an added ::text.
  function_definition := regexp_replace(
    function_definition,
    '(^|\n)([[:blank:]]*)currency text := ''AED''(::text)?;',
    '\1\2default_currency text := ''AED''\3;',
    'g'
  );
  function_definition := replace(
    function_definition,
    'INTO currency',
    'INTO default_currency'
  );
  function_definition := replace(
    function_definition,
    '''currency'', currency',
    '''currency'', default_currency'
  );
  function_definition := replace(
    function_definition,
    'COALESCE(v.currency, currency)',
    'COALESCE(v.currency, default_currency)'
  );
  function_definition := replace(
    function_definition,
    'COALESCE(p.currency, currency)',
    'COALESCE(p.currency, default_currency)'
  );

  EXECUTE function_definition;
END
$migration$;

REVOKE ALL ON FUNCTION public.get_my_customer_soa() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_customer_soa() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_soa() TO authenticated;
