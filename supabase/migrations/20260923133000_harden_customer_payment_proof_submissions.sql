-- Prevent customer-created TT proofs from containing fabricated review metadata.
-- This is separate from the original feature migration so existing environments are hardened too.

drop policy if exists customer_submit_own_payment_proofs on public.customer_payment_proofs;
create policy customer_submit_own_payment_proofs on public.customer_payment_proofs
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and status = 'submitted'
  and matched_remittance_id is null
  and reviewed_by is null
  and reviewed_at is null
  and review_note is null
  and exists (
    select 1
    from public.customer_profiles cp
    where cp.id = (select auth.uid())
      and cp.customer_id = customer_payment_proofs.customer_id
      and cp.is_active
  )
);
