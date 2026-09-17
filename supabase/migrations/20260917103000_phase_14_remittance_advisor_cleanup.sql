create index if not exists remittances_created_by_idx
  on public.remittances(created_by);

drop policy if exists "deny_direct_remittance_sequence_access" on public.remittance_sequences;
create policy "deny_direct_remittance_sequence_access"
  on public.remittance_sequences
  for select
  to authenticated
  using (false);
