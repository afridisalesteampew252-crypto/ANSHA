-- Index active inventory-to-supplier joins and customer TT proof review/matching joins.
-- Plain btree indexes are intentional: they support FK checks, joins, and Supabase's
-- unindexed-foreign-key advisor without adding application-visible behavior.

create index if not exists vehicles_supplier_invoice_id_idx
  on public.vehicles (supplier_invoice_id);

create index if not exists parts_supplier_invoice_id_idx
  on public.parts (supplier_invoice_id);

create index if not exists customer_payment_proofs_matched_remittance_id_idx
  on public.customer_payment_proofs (matched_remittance_id);

create index if not exists customer_payment_proofs_reviewed_by_idx
  on public.customer_payment_proofs (reviewed_by);

create index if not exists customer_payment_proofs_uploaded_by_idx
  on public.customer_payment_proofs (uploaded_by);
