-- Carry customer ownership into operational records without rewriting creator audit fields.

alter table public.invoices
  add column if not exists owner_id uuid references public.admin_profiles(id) on delete set null;
alter table public.remittances
  add column if not exists owner_id uuid references public.admin_profiles(id) on delete set null;

create index if not exists invoices_owner_id_idx on public.invoices(owner_id);
create index if not exists remittances_owner_id_idx on public.remittances(owner_id);

update public.invoices inv
set owner_id = c.owner_id
from public.customers c
where c.id = inv.customer_id and inv.owner_id is distinct from c.owner_id;

update public.remittances rem
set owner_id = c.owner_id
from public.customers c
where c.id = rem.customer_id and rem.owner_id is distinct from c.owner_id;

create or replace function private.sync_financial_owner_from_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_owner uuid;
  owner_office uuid;
  owner_shift uuid;
begin
  if new.customer_id is null then
    new.owner_id := null;
    return new;
  end if;

  select c.owner_id, ap.office_id, ap.shift_id
  into customer_owner, owner_office, owner_shift
  from public.customers c
  left join public.admin_profiles ap on ap.id = c.owner_id and ap.is_active = true
  where c.id = new.customer_id;

  new.owner_id := customer_owner;
  if tg_table_name = 'remittances' and customer_owner is not null then
    if new.received_by is null then new.received_by := customer_owner; end if;
    if new.office_id is null then new.office_id := owner_office; end if;
    if new.shift_id is null then new.shift_id := owner_shift; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_invoice_owner_from_customer on public.invoices;
create trigger sync_invoice_owner_from_customer
before insert or update of customer_id on public.invoices
for each row execute function private.sync_financial_owner_from_customer();

drop trigger if exists sync_remittance_owner_from_customer on public.remittances;
create trigger sync_remittance_owner_from_customer
before insert or update of customer_id on public.remittances
for each row execute function private.sync_financial_owner_from_customer();

create or replace function private.sync_inventory_owner_from_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_owner uuid;
  owner_name text;
  owner_role text;
begin
  if new.reserved_customer_id is null or new.stock_status <> 'reserved' then return new; end if;

  select c.owner_id, coalesce(nullif(btrim(ap.full_name), ''), ap.email), ap.role
  into customer_owner, owner_name, owner_role
  from public.customers c
  left join public.admin_profiles ap on ap.id = c.owner_id and ap.is_active = true
  where c.id = new.reserved_customer_id;

  if customer_owner is not null then
    new.reserved_by := customer_owner;
    new.reservation_requester_name := owner_name;
    new.reservation_requester_role := owner_role;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_part_owner_from_customer on public.parts;
create trigger sync_part_owner_from_customer
before insert or update of reserved_customer_id, stock_status on public.parts
for each row execute function private.sync_inventory_owner_from_customer();

drop trigger if exists sync_vehicle_owner_from_customer on public.vehicles;
create trigger sync_vehicle_owner_from_customer
before insert or update of reserved_customer_id, stock_status on public.vehicles
for each row execute function private.sync_inventory_owner_from_customer();

create or replace function private.cascade_customer_workflow_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_name text;
  owner_role text;
  owner_office uuid;
  owner_shift uuid;
begin
  if new.owner_id is not null then
    select coalesce(nullif(btrim(full_name), ''), email), role, office_id, shift_id
    into owner_name, owner_role, owner_office, owner_shift
    from public.admin_profiles where id = new.owner_id and is_active = true;
  end if;

  update public.invoices set owner_id = new.owner_id, updated_at = now()
  where customer_id = new.id and owner_id is distinct from new.owner_id;

  update public.remittances
  set owner_id = new.owner_id,
      received_by = case when new.owner_id is null then received_by else new.owner_id end,
      office_id = case when new.owner_id is null then office_id else owner_office end,
      shift_id = case when new.owner_id is null then shift_id else owner_shift end,
      updated_at = now()
  where customer_id = new.id;

  update public.parts
  set reserved_by = new.owner_id,
      reservation_requester_name = owner_name,
      reservation_requester_role = owner_role,
      updated_at = now()
  where reserved_customer_id = new.id and stock_status = 'reserved';

  update public.vehicles
  set reserved_by = new.owner_id,
      reservation_requester_name = owner_name,
      reservation_requester_role = owner_role,
      updated_at = now()
  where reserved_customer_id = new.id and stock_status = 'reserved';

  update public.workspace_requests
  set assigned_to = new.owner_id, updated_at = now()
  where customer_id = new.id and status in ('open', 'in_progress', 'waiting');

  return new;
end;
$$;

drop trigger if exists cascade_customer_workflow_owner on public.customers;
create trigger cascade_customer_workflow_owner
after update of owner_id on public.customers
for each row
when (old.owner_id is distinct from new.owner_id)
execute function private.cascade_customer_workflow_owner();

create or replace function public.link_remittance(
  p_remittance_id uuid,
  p_customer_id uuid,
  p_customer_name text default null,
  p_received_by uuid default null,
  p_office_id uuid default null,
  p_shift_id uuid default null,
  p_status text default 'confirmed'
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  remittance_row public.remittances%rowtype;
  v_name text;
  v_received_by uuid;
  v_office_id uuid;
  v_shift_id uuid;
begin
  if not private.can_manage_receivables() and not private.can_assign_customer_owner() then
    raise exception 'Receivables access required';
  end if;
  select * into remittance_row from public.remittances where id = p_remittance_id for update;
  if not found then raise exception 'Remittance not found'; end if;
  if p_customer_id is null then raise exception 'Customer is required to resolve unknown remittance'; end if;

  select coalesce(nullif(btrim(p_customer_name), ''), c.company_name, c.full_name),
         coalesce(c.owner_id, p_received_by, remittance_row.received_by)
  into v_name, v_received_by
  from public.customers c where c.id = p_customer_id;
  if v_name is null then raise exception 'Customer not found'; end if;
  if v_received_by is null then
    raise exception 'Assign an account owner to this customer before resolving the remittance';
  end if;

  select coalesce(p_office_id, ap.office_id, remittance_row.office_id),
         coalesce(p_shift_id, ap.shift_id, remittance_row.shift_id)
  into v_office_id, v_shift_id
  from public.admin_profiles ap
  where ap.id = v_received_by and ap.is_active = true;
  if not found then raise exception 'Assigned account owner is inactive or unavailable'; end if;

  update public.remittances
  set customer_id = p_customer_id,
      customer_name = v_name,
      owner_id = v_received_by,
      received_by = v_received_by,
      office_id = v_office_id,
      shift_id = v_shift_id,
      is_unknown = false,
      status = 'confirmed'
  where id = p_remittance_id;
  return true;
end;
$$;

revoke all on function public.link_remittance(uuid,uuid,text,uuid,uuid,uuid,text) from public;
revoke all on function public.link_remittance(uuid,uuid,text,uuid,uuid,uuid,text) from anon;
grant execute on function public.link_remittance(uuid,uuid,text,uuid,uuid,uuid,text) to authenticated;

drop policy if exists receivables_read_invoices on public.invoices;
create policy receivables_read_invoices on public.invoices
for select to authenticated
using (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and owner_id = (select auth.uid()))
);

drop policy if exists receivables_update_invoices on public.invoices;
create policy receivables_update_invoices on public.invoices
for update to authenticated
using (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and document_type = 'proforma_invoice' and status = 'draft' and owner_id = (select auth.uid()))
)
with check (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and document_type = 'proforma_invoice' and status = 'draft' and owner_id = (select auth.uid()))
);

drop policy if exists receivables_read_remittances on public.remittances;
create policy receivables_read_remittances on public.remittances
for select to authenticated
using (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or owner_id = (select auth.uid())
);

drop policy if exists receivables_update_remittances on public.remittances;
create policy receivables_update_remittances on public.remittances
for update to authenticated
using ((select private.can_manage_receivables()) or (select private.can_assign_customer_owner()))
with check ((select private.can_manage_receivables()) or (select private.can_assign_customer_owner()));
