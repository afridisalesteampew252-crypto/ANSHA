-- Align the customers.owner_id guard trigger with assign_customer_owner() and
-- list_customer_assignees().
--
-- assign_customer_owner() and list_customer_assignees() both offer active ADMIN profiles as
-- account owners (and the admin UI shows "Assign to me" to admins), but the trigger
-- private.guard_customer_owner_assignment() only accepted manager / sales / freelancer
-- owners and raised errcode 42501. PostgREST returns that as HTTP 403, which is the
-- "assign_customer_owner returns 403 for admin/manager users" error seen in the API logs
-- ("Customers may only be assigned to an active manager, sales agent, or freelancer").
-- Who may assign is unchanged: private.can_assign_customer_owner() (admin, manager).

CREATE OR REPLACE FUNCTION private.guard_customer_owner_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
begin
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if new.owner_id is not null and not exists (
    select 1
    from public.admin_profiles
    where id = new.owner_id
      and is_active = true
      and role in ('admin', 'manager', 'sales', 'freelancer')
  ) then
    raise exception 'Customers may only be assigned to an active admin, manager, sales agent, or freelancer'
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
$function$;

-- Lets the admin UI ask the database (instead of guessing from a cached role) whether the
-- signed-in user may assign owners / record platform health checks.
CREATE OR REPLACE FUNCTION public.get_my_workspace_capabilities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'role', (SELECT role FROM public.admin_profiles WHERE id = (SELECT auth.uid()) AND is_active = true),
    'can_assign_customer_owner', private.can_assign_customer_owner(),
    'can_record_system_health', private.is_platform_admin()
  );
$function$;

REVOKE ALL ON FUNCTION public.get_my_workspace_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_capabilities() TO authenticated;
