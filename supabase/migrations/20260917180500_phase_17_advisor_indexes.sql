-- Cover Phase 17 foreign keys used during notification and allocation cleanup.
CREATE INDEX IF NOT EXISTS admin_notifications_actor_id_idx
  ON public.admin_notifications (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS remittance_allocations_created_by_idx
  ON public.remittance_allocations (created_by);
