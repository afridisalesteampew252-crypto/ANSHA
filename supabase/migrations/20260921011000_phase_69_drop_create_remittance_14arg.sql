/* Phase 69 follow-up: remove ambiguous 14-arg create_remittance overload. */
DROP FUNCTION IF EXISTS public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, uuid, uuid);
