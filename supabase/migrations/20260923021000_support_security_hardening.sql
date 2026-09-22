/* Tighten portal support RPC permissions and cover support foreign keys. */
REVOKE EXECUTE ON FUNCTION public.get_support_presence() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_support_thread_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_customer_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_support_thread_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_customer_last_seen() TO authenticated;

CREATE INDEX IF NOT EXISTS support_threads_assigned_to_idx
  ON public.support_threads (assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_messages_sender_idx
  ON public.support_messages (sender_id);
CREATE INDEX IF NOT EXISTS support_attachments_uploader_idx
  ON public.support_attachments (uploaded_by);
