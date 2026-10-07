-- Reviewed against the migration replay catalog. Keep existing constraint,
-- catalog/search and monthly reporting indexes; no unused index is removed.
-- Portal reservations and customer assignment cascade filter by this FK;
-- parts already has parts_reserved_customer_idx, vehicles had no counterpart.
CREATE INDEX IF NOT EXISTS vehicles_reserved_customer_idx
  ON public.vehicles (reserved_customer_id) WHERE reserved_customer_id IS NOT NULL;

-- The support-only partial index cannot serve all account devices or the
-- owner policies when notify_support=false (native recipient lookup included).
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id) WHERE user_id IS NOT NULL;

-- Portal inquiry lists filter by the authenticated customer profile, and
-- removing a portal identity checks the same child FK.
CREATE INDEX IF NOT EXISTS inquiries_customer_profile_id_idx
  ON public.inquiries (customer_profile_id) WHERE customer_profile_id IS NOT NULL;

-- PO receipt/remaining-quantity calculations join receipt lines back to a PO
-- line. The receipt_id index alone does not cover that reverse join/FK check.
CREATE INDEX IF NOT EXISTS inventory_receipt_lines_purchase_order_line_id_idx
  ON public.inventory_receipt_lines (purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;
