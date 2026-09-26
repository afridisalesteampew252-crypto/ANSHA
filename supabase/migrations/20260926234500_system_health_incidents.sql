-- Deduplicated health incidents. Only authenticated admins can report or read them.
CREATE TABLE IF NOT EXISTS public.system_health_incidents (
  service text PRIMARY KEY CHECK (service IN ('website', 'database', 'notifications')),
  status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded')),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  details text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  resolved_at timestamptz
);
ALTER TABLE public.system_health_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_health_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.system_health_incidents TO authenticated;
CREATE POLICY system_health_admin_read ON public.system_health_incidents
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

CREATE OR REPLACE FUNCTION public.record_system_health_check(
  p_service text, p_healthy boolean, p_details text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_status text;
  failures integer;
  last_check timestamptz;
  next_status text;
  safe_details text := left(COALESCE(p_details, ''), 240);
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING errcode = '42501';
  END IF;
  IF p_service NOT IN ('website', 'database', 'notifications') OR p_healthy IS NULL THEN
    RAISE EXCEPTION 'Invalid service status';
  END IF;

  INSERT INTO public.system_health_incidents(service, checked_at)
  VALUES (p_service, now() - interval '30 seconds')
  ON CONFLICT (service) DO NOTHING;

  SELECT status, consecutive_failures, checked_at
  INTO previous_status, failures, last_check
  FROM public.system_health_incidents
  WHERE service = p_service
  FOR UPDATE;

  IF last_check > now() - interval '30 seconds' THEN RETURN; END IF;
  failures := CASE WHEN p_healthy THEN 0 ELSE failures + 1 END;
  next_status := CASE WHEN p_healthy THEN 'healthy'
                      WHEN failures >= 2 THEN 'degraded'
                      ELSE previous_status END;

  UPDATE public.system_health_incidents
  SET status = next_status,
      consecutive_failures = failures,
      details = CASE WHEN p_healthy THEN NULL ELSE safe_details END,
      checked_at = now(),
      opened_at = CASE WHEN previous_status <> 'degraded' AND next_status = 'degraded' THEN now() ELSE opened_at END,
      resolved_at = CASE WHEN previous_status = 'degraded' AND next_status = 'healthy' THEN now() ELSE resolved_at END
  WHERE service = p_service;

  IF previous_status IS DISTINCT FROM next_status THEN
    INSERT INTO public.admin_notifications(recipient_id, notification_type, title, body, href, entity_type)
    SELECT id, 'system',
           CASE WHEN next_status = 'degraded' THEN 'System alert: ' || p_service
                ELSE 'System recovered: ' || p_service END,
           CASE WHEN next_status = 'degraded' THEN COALESCE(NULLIF(safe_details, ''), 'Service health check failed twice.')
                ELSE 'Service health checks are passing again.' END,
           '/admin/system-health', 'system_health'
    FROM public.admin_profiles
    WHERE role = 'admin' AND is_active = true;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_system_health_check(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_system_health_check(text, boolean, text) TO authenticated;
