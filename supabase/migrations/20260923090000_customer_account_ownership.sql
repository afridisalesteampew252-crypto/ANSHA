-- Customer/account-owner assignment. Ownership drives field-agent workflow scope.

create or replace function private.can_assign_customer_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager')
  );
$$;

revoke all on function private.can_assign_customer_owner() from public;
grant execute on function private.can_assign_customer_owner() to authenticated;

create or replace function private.guard_customer_owner_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
begin
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  -- Trusted backend jobs retain their existing administrative path.
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if new.owner_id is not null and not exists (
    select 1
    from public.admin_profiles
    where id = new.owner_id
      and is_active = true
      and role in ('manager', 'sales', 'freelancer')
  ) then
    raise exception 'Customers may only be assigned to an active manager, sales agent, or freelancer'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select role into caller_role
    from public.admin_profiles
    where id = caller_id and is_active = true;

    if new.owner_id is null
       or (new.owner_id = caller_id and caller_role in ('sales', 'freelancer'))
       or private.can_assign_customer_owner() then
      return new;
    end if;
  elsif private.can_assign_customer_owner() then
    return new;
  end if;

  raise exception 'Only an admin or manager can change the assigned account owner'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_customer_owner_assignment on public.customers;
create trigger guard_customer_owner_assignment
before insert or update of owner_id on public.customers
for each row execute function private.guard_customer_owner_assignment();

create or replace function public.list_customer_assignees()
returns table(id uuid, full_name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_profiles
    where admin_profiles.id = (select auth.uid()) and is_active = true
  ) then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;

  return query
  select ap.id, coalesce(nullif(btrim(ap.full_name), ''), ap.email, 'Team member'), ap.role
  from public.admin_profiles ap
  where ap.is_active = true and ap.role in ('manager', 'sales', 'freelancer')
  order by case ap.role when 'manager' then 1 when 'sales' then 2 else 3 end,
           coalesce(ap.full_name, ap.email, '');
end;
$$;

revoke all on function public.list_customer_assignees() from public;
revoke all on function public.list_customer_assignees() from anon;
grant execute on function public.list_customer_assignees() to authenticated;

create or replace function public.assign_customer_owner(p_customer_id uuid, p_owner_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_owner uuid;
  assigned_name text;
  assigned_role text;
begin
  if not private.can_assign_customer_owner() then
    raise exception 'Only an admin or manager can assign customers' using errcode = '42501';
  end if;

  if p_owner_id is not null then
    select coalesce(nullif(btrim(full_name), ''), email, 'Team member'), role
    into assigned_name, assigned_role
    from public.admin_profiles
    where id = p_owner_id
      and is_active = true
      and role in ('manager', 'sales', 'freelancer');

    if assigned_role is null then
      raise exception 'Select an active manager, sales agent, or freelancer';
    end if;
  end if;

  select owner_id into previous_owner
  from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;

  update public.customers
  set owner_id = p_owner_id, updated_at = now()
  where id = p_customer_id;

  perform private.write_audit_log(
    'customer_owner_changed',
    'customer',
    p_customer_id,
    jsonb_build_object('previous_owner_id', previous_owner, 'owner_id', p_owner_id)
  );

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'owner_id', p_owner_id,
    'owner_name', assigned_name,
    'owner_role', assigned_role
  );
end;
$$;

revoke all on function public.assign_customer_owner(uuid, uuid) from public;
revoke all on function public.assign_customer_owner(uuid, uuid) from anon;
grant execute on function public.assign_customer_owner(uuid, uuid) to authenticated;

create or replace function public.get_my_customer_owner()
returns table(full_name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  customer_id uuid := private.my_customer_id();
begin
  if customer_id is null then
    raise exception 'Customer portal access required' using errcode = '42501';
  end if;

  return query
  select coalesce(nullif(btrim(ap.full_name), ''), 'ANSHA team'), ap.role
  from public.customers c
  join public.admin_profiles ap on ap.id = c.owner_id and ap.is_active = true
  where c.id = customer_id;
end;
$$;

revoke all on function public.get_my_customer_owner() from public;
revoke all on function public.get_my_customer_owner() from anon;
grant execute on function public.get_my_customer_owner() to authenticated;

drop policy if exists workspace_select_customers on public.customers;
create policy workspace_select_customers on public.customers
for select to authenticated
using (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and owner_id = (select auth.uid()))
);

drop policy if exists workspace_insert_customers on public.customers;
create policy workspace_insert_customers on public.customers
for insert to authenticated
with check (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and owner_id = (select auth.uid()))
);

drop policy if exists workspace_update_customers on public.customers;
create policy workspace_update_customers on public.customers
for update to authenticated
using (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and owner_id = (select auth.uid()))
)
with check (
  (select private.can_manage_receivables())
  or (select private.can_assign_customer_owner())
  or ((select private.is_field_agent()) and owner_id = (select auth.uid()))
);
