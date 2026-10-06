-- Spam protection for anonymous inserts into public.inquiries and public.part_requests.
-- No external service or secret is required.
--
-- 1. Length / shape CHECK constraints (NOT VALID: enforced for new rows only, existing rows
--    are not re-checked, so the migration cannot fail on historic data).
-- 2. A BEFORE INSERT trigger that rate-limits non-staff submissions per client IP (hashed,
--    taken from the PostgREST request headers) plus a global hourly ceiling. Staff
--    (admin_profiles) and service_role inserts are never limited.
--
-- Every accepted inquiry / part request also fires notification + workspace-request triggers,
-- so throttling here protects the admin inbox as well.

-- ---------------------------------------------------------------------------
-- 1. Column limits
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  DROP CONSTRAINT IF EXISTS inquiries_customer_name_length,
  DROP CONSTRAINT IF EXISTS inquiries_customer_email_length,
  DROP CONSTRAINT IF EXISTS inquiries_customer_phone_length,
  DROP CONSTRAINT IF EXISTS inquiries_message_length;

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_customer_name_length
    CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT inquiries_customer_email_length
    CHECK (customer_email IS NULL OR (char_length(customer_email) <= 254 AND customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) NOT VALID,
  ADD CONSTRAINT inquiries_customer_phone_length
    CHECK (customer_phone IS NULL OR char_length(customer_phone) <= 40) NOT VALID,
  ADD CONSTRAINT inquiries_message_length
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000) NOT VALID;

ALTER TABLE public.part_requests
  DROP CONSTRAINT IF EXISTS part_requests_customer_name_length,
  DROP CONSTRAINT IF EXISTS part_requests_email_length,
  DROP CONSTRAINT IF EXISTS part_requests_phone_length,
  DROP CONSTRAINT IF EXISTS part_requests_vehicle_fields_length,
  DROP CONSTRAINT IF EXISTS part_requests_part_fields_length,
  DROP CONSTRAINT IF EXISTS part_requests_message_length;

ALTER TABLE public.part_requests
  ADD CONSTRAINT part_requests_customer_name_length
    CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT part_requests_email_length
    CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) NOT VALID,
  ADD CONSTRAINT part_requests_phone_length
    CHECK (phone IS NULL OR char_length(phone) <= 40) NOT VALID,
  ADD CONSTRAINT part_requests_vehicle_fields_length
    CHECK (
      coalesce(char_length(vehicle_make), 0) <= 80
      AND coalesce(char_length(vehicle_model), 0) <= 80
      AND coalesce(char_length(vehicle_year), 0) <= 10
    ) NOT VALID,
  ADD CONSTRAINT part_requests_part_fields_length
    CHECK (
      coalesce(char_length(part_name), 0) <= 200
      AND coalesce(char_length(part_number), 0) <= 120
    ) NOT VALID,
  ADD CONSTRAINT part_requests_message_length
    CHECK (message IS NULL OR char_length(message) <= 5000) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Rate limiting
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.public_form_submissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  client_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_form_submissions_client_idx
  ON private.public_form_submissions (form, client_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS public_form_submissions_created_idx
  ON private.public_form_submissions (created_at);

ALTER TABLE private.public_form_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.public_form_submissions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_public_form_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  headers jsonb;
  client_ip text;
  client_key text;
  per_client_10m integer;
  per_client_24h integer;
  global_1h integer;
  max_per_client_10m constant integer := 5;
  max_per_client_24h constant integer := 30;
  max_global_1h constant integer := 120;
begin
  if (select auth.role()) = 'service_role' or private.is_workspace_user() then
    return new;
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;

  client_ip := nullif(btrim(coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1)
  )), '');
  client_key := case when client_ip is null then null else md5('ansha-public-form:' || client_ip) end;

  select count(*) into global_1h
  from private.public_form_submissions
  where created_at > now() - interval '1 hour';

  if global_1h >= max_global_1h then
    raise exception 'Too many requests right now. Please try again later or contact us on WhatsApp.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  if client_key is not null then
    select
      count(*) filter (where created_at > now() - interval '10 minutes'),
      count(*)
    into per_client_10m, per_client_24h
    from private.public_form_submissions
    where client_hash = client_key
      and created_at > now() - interval '24 hours';

    if per_client_10m >= max_per_client_10m or per_client_24h >= max_per_client_24h then
      raise exception 'Too many requests from this connection. Please try again later or contact us on WhatsApp.'
        using errcode = 'P0001', hint = 'rate_limited';
    end if;
  end if;

  insert into private.public_form_submissions (form, client_hash)
  values (tg_table_name, client_key);

  -- Keep the log small; it only needs the last 24 hours.
  delete from private.public_form_submissions
  where created_at < now() - interval '2 days';

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.enforce_public_form_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_public_form_rate_limit ON public.inquiries;
CREATE TRIGGER enforce_public_form_rate_limit
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION private.enforce_public_form_rate_limit();

DROP TRIGGER IF EXISTS enforce_public_form_rate_limit ON public.part_requests;
CREATE TRIGGER enforce_public_form_rate_limit
  BEFORE INSERT ON public.part_requests
  FOR EACH ROW EXECUTE FUNCTION private.enforce_public_form_rate_limit();
