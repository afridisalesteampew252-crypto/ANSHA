/*
  Phase 1 RLS policy role hardening.

  These policies only make sense for signed-in workspace/receivables users.
  Their predicates already depend on authenticated identity/role helpers.
  Limiting them from PUBLIC to authenticated removes unnecessary anonymous
  policy evaluation and makes the authorization boundary explicit.
*/

ALTER POLICY workspace_delete_customers
  ON public.customers
  TO authenticated;

ALTER POLICY workspace_select_customers
  ON public.customers
  TO authenticated;

ALTER POLICY workspace_update_customers
  ON public.customers
  TO authenticated;

ALTER POLICY receivables_read_invoice_items
  ON public.invoice_items
  TO authenticated;

ALTER POLICY receivables_read_invoices
  ON public.invoices
  TO authenticated;

ALTER POLICY receivables_update_invoices
  ON public.invoices
  TO authenticated;
