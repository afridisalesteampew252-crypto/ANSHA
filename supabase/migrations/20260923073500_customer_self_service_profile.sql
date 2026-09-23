create or replace function public.update_my_customer_profile(
  p_full_name text,
  p_company_name text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_country text default null,
  p_address text default null,
  p_avatar_url text default null,
  p_consignee_name text default null,
  p_consignee_company text default null,
  p_consignee_phone text default null,
  p_consignee_email text default null,
  p_consignee_address text default null,
  p_consignee_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_customer public.customers;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_customer_id := private.my_customer_id();
  if v_customer_id is null then
    raise exception 'Customer profile is not linked';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Full name must contain at least 2 characters';
  end if;

  if p_avatar_url is not null
     and p_avatar_url !~ ('^self/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid profile image path';
  end if;

  update public.customers
  set
    full_name = left(trim(p_full_name), 160),
    company_name = nullif(left(trim(coalesce(p_company_name, '')), 200), ''),
    phone = nullif(left(trim(coalesce(p_phone, '')), 60), ''),
    whatsapp = nullif(left(trim(coalesce(p_whatsapp, '')), 60), ''),
    country = nullif(left(trim(coalesce(p_country, '')), 100), ''),
    address = nullif(left(trim(coalesce(p_address, '')), 1000), ''),
    avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
    consignee_name = nullif(left(trim(coalesce(p_consignee_name, '')), 160), ''),
    consignee_company = nullif(left(trim(coalesce(p_consignee_company, '')), 200), ''),
    consignee_phone = nullif(left(trim(coalesce(p_consignee_phone, '')), 60), ''),
    consignee_email = nullif(left(trim(coalesce(p_consignee_email, '')), 320), ''),
    consignee_address = nullif(left(trim(coalesce(p_consignee_address, '')), 1000), ''),
    consignee_country = nullif(left(trim(coalesce(p_consignee_country, '')), 100), ''),
    updated_at = now()
  where id = v_customer_id
  returning * into v_customer;

  if v_customer.id is null then
    raise exception 'Customer profile not found';
  end if;

  update public.customer_profiles
  set full_name = v_customer.full_name, updated_at = now()
  where id = v_uid and customer_id = v_customer_id;

  return jsonb_build_object(
    'customer_code', v_customer.customer_code,
    'full_name', v_customer.full_name,
    'avatar_url', v_customer.avatar_url,
    'updated_at', v_customer.updated_at
  );
end;
$$;

revoke all on function public.update_my_customer_profile(text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.update_my_customer_profile(text,text,text,text,text,text,text,text,text,text,text,text,text) from anon;
grant execute on function public.update_my_customer_profile(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

drop policy if exists self_select_profile_images on storage.objects;
create policy self_select_profile_images
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = 'self'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);
