-- Covering indexes for foreign keys the app joins / filters on and which had no index
-- (checked against pg_indexes on 2026-10-06). All small tables; IF NOT EXISTS keeps this
-- idempotent. Partial (IS NOT NULL) because most rows leave these optional links empty.
CREATE INDEX IF NOT EXISTS workspace_requests_customer_id_idx
  ON public.workspace_requests (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inquiries_vehicle_id_idx
  ON public.inquiries (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_transactions_expense_id_idx
  ON public.bank_transactions (expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_order_lines_part_id_idx
  ON public.purchase_order_lines (part_id) WHERE part_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_order_lines_vehicle_id_idx
  ON public.purchase_order_lines (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_stock_events_invoice_id_idx
  ON public.inventory_stock_events (invoice_id) WHERE invoice_id IS NOT NULL;
