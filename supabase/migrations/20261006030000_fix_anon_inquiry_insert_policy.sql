-- Fix: anonymous website enquiries failed with 42501 "permission denied for table customer_profiles".
-- public_insert_inquiries (TO anon, authenticated) has a WITH CHECK whose EXISTS subquery reads
-- public.customer_profiles. anon has no privilege on that table, and Postgres checks table privileges for
-- every relation in the expression even when the OR short-circuits on customer_profile_id IS NULL.
-- Split into an anon policy that never references customer_profiles and an authenticated policy that keeps
-- the original rule. No grants change, so anon still cannot read customer_profiles.
drop policy if exists public_insert_inquiries on public.inquiries;

create policy public_insert_inquiries_anon on public.inquiries
  as permissive for insert to anon
  with check (customer_profile_id is null);

create policy public_insert_inquiries_authenticated on public.inquiries
  as permissive for insert to authenticated
  with check (
    customer_profile_id is null
    or (
      customer_profile_id = (select auth.uid())
      and exists (
        select 1 from public.customer_profiles cp
        where cp.id = inquiries.customer_profile_id and cp.is_active = true
      )
    )
  );
