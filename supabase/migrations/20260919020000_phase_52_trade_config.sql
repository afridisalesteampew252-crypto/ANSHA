-- Phase 52: configurable export market policies (rates / freight / import notes)
create table if not exists public.export_market_configs (
  country_code text primary key check (char_length(country_code) = 2),
  country_name text not null,
  import_policy text,
  freight_notes text,
  exchange_rate_note text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.site_trade_settings (
  id int primary key default 1 check (id = 1),
  base_currency text not null default 'AED',
  usd_rate numeric(18, 6),
  eur_rate numeric(18, 6),
  gbp_rate numeric(18, 6),
  default_freight_notes text,
  default_export_policy text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.site_trade_settings (id, base_currency)
values (1, 'AED')
on conflict (id) do nothing;

alter table public.export_market_configs enable row level security;
alter table public.site_trade_settings enable row level security;

drop policy if exists export_market_configs_public_read on public.export_market_configs;
create policy export_market_configs_public_read
  on public.export_market_configs for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists export_market_configs_ops_write on public.export_market_configs;
create policy export_market_configs_ops_write
  on public.export_market_configs for all
  to authenticated
  using ((select private.is_ops_user()))
  with check ((select private.is_ops_user()));

drop policy if exists site_trade_settings_public_read on public.site_trade_settings;
create policy site_trade_settings_public_read
  on public.site_trade_settings for select
  to anon, authenticated
  using (true);

drop policy if exists site_trade_settings_ops_write on public.site_trade_settings;
create policy site_trade_settings_ops_write
  on public.site_trade_settings for all
  to authenticated
  using ((select private.is_ops_user()))
  with check ((select private.is_ops_user()));
