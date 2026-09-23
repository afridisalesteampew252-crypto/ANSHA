-- Customer-submitted telegraphic transfer (TT) copies for private receivables matching.

create table if not exists public.customer_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (char_length(currency) = 3),
  transfer_date date not null,
  bank_reference text,
  sender_bank text,
  notes text,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'submitted' check (status in ('submitted', 'matched', 'rejected')),
  matched_remittance_id uuid references public.remittances(id) on delete set null,
  reviewed_by uuid references public.admin_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_payment_proofs_path_check
    check (storage_path like customer_id::text || '/' || uploaded_by::text || '/%')
);

create index if not exists customer_payment_proofs_customer_idx
  on public.customer_payment_proofs(customer_id, created_at desc);
create index if not exists customer_payment_proofs_status_idx
  on public.customer_payment_proofs(status, created_at desc);

alter table public.customer_payment_proofs enable row level security;

drop policy if exists customer_read_own_payment_proofs on public.customer_payment_proofs;
create policy customer_read_own_payment_proofs on public.customer_payment_proofs
for select to authenticated
using (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.customer_profiles cp
    where cp.id = (select auth.uid()) and cp.customer_id = customer_payment_proofs.customer_id and cp.is_active
  )
);

drop policy if exists customer_submit_own_payment_proofs on public.customer_payment_proofs;
create policy customer_submit_own_payment_proofs on public.customer_payment_proofs
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and status = 'submitted'
  and matched_remittance_id is null
  and reviewed_by is null
  and exists (
    select 1 from public.customer_profiles cp
    where cp.id = (select auth.uid()) and cp.customer_id = customer_payment_proofs.customer_id and cp.is_active
  )
);

drop policy if exists receivables_read_payment_proofs on public.customer_payment_proofs;
create policy receivables_read_payment_proofs on public.customer_payment_proofs
for select to authenticated
using ((select private.can_manage_receivables()) or (select private.can_assign_customer_owner()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-payment-proofs',
  'customer-payment-proofs',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists customer_upload_own_payment_proof_files on storage.objects;
create policy customer_upload_own_payment_proof_files on storage.objects
for insert to authenticated
with check (
  bucket_id = 'customer-payment-proofs'
  and exists (
    select 1 from public.customer_profiles cp
    where cp.id = (select auth.uid())
      and cp.is_active
      and (storage.foldername(name))[1] = cp.customer_id::text
      and (storage.foldername(name))[2] = (select auth.uid())::text
  )
);

drop policy if exists customer_read_own_payment_proof_files on storage.objects;
create policy customer_read_own_payment_proof_files on storage.objects
for select to authenticated
using (
  bucket_id = 'customer-payment-proofs'
  and exists (
    select 1 from public.customer_profiles cp
    where cp.id = (select auth.uid())
      and cp.is_active
      and (storage.foldername(name))[1] = cp.customer_id::text
      and (storage.foldername(name))[2] = (select auth.uid())::text
  )
);

drop policy if exists receivables_read_customer_payment_proof_files on storage.objects;
create policy receivables_read_customer_payment_proof_files on storage.objects
for select to authenticated
using (
  bucket_id = 'customer-payment-proofs'
  and ((select private.can_manage_receivables()) or (select private.can_assign_customer_owner()))
);

create or replace function public.match_customer_payment_proof(
  p_proof_id uuid,
  p_remittance_id uuid,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  proof_row public.customer_payment_proofs%rowtype;
  remittance_row public.remittances%rowtype;
begin
  if not private.can_manage_receivables() and not private.can_assign_customer_owner() then
    raise exception 'Receivables access required';
  end if;

  select * into proof_row from public.customer_payment_proofs where id = p_proof_id for update;
  if not found then raise exception 'Payment proof not found'; end if;
  if proof_row.status <> 'submitted' then raise exception 'Payment proof has already been reviewed'; end if;

  select * into remittance_row from public.remittances where id = p_remittance_id for update;
  if not found then raise exception 'Remittance not found'; end if;
  if not remittance_row.is_unknown and remittance_row.status <> 'unknown' then
    raise exception 'Only an unconfirmed Unknown TTS can be matched';
  end if;
  if upper(remittance_row.currency) <> upper(proof_row.currency) then
    raise exception 'Currency does not match the remittance';
  end if;
  if remittance_row.amount <> proof_row.amount then
    raise exception 'Amount does not match the remittance';
  end if;

  perform public.link_remittance(p_remittance_id, proof_row.customer_id, null, null, null, null, 'confirmed');

  update public.customer_payment_proofs
  set status = 'matched', matched_remittance_id = p_remittance_id,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_review_note), ''), updated_at = now()
  where id = p_proof_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'match_customer_payment_proof', 'customer_payment_proof', p_proof_id,
    jsonb_build_object('remittance_id', p_remittance_id, 'customer_id', proof_row.customer_id));
  return true;
end;
$$;

create or replace function public.reject_customer_payment_proof(
  p_proof_id uuid,
  p_review_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_receivables() and not private.can_assign_customer_owner() then
    raise exception 'Receivables access required';
  end if;
  if nullif(btrim(p_review_note), '') is null then raise exception 'A rejection reason is required'; end if;

  update public.customer_payment_proofs
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = btrim(p_review_note), updated_at = now()
  where id = p_proof_id and status = 'submitted';
  if not found then raise exception 'Submitted payment proof not found'; end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'reject_customer_payment_proof', 'customer_payment_proof', p_proof_id,
    jsonb_build_object('reason', btrim(p_review_note)));
  return true;
end;
$$;

revoke all on function public.match_customer_payment_proof(uuid,uuid,text) from public, anon;
grant execute on function public.match_customer_payment_proof(uuid,uuid,text) to authenticated;
revoke all on function public.reject_customer_payment_proof(uuid,text) from public, anon;
grant execute on function public.reject_customer_payment_proof(uuid,text) to authenticated;

grant select, insert on public.customer_payment_proofs to authenticated;

