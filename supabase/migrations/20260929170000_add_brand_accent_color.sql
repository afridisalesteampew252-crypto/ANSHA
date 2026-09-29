alter table public.site_trade_settings
  add column if not exists brand_accent_color text not null default '#D21E1E';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.site_trade_settings'::regclass
      and conname = 'site_trade_settings_brand_accent_color_hex_check'
  ) then
    alter table public.site_trade_settings
      add constraint site_trade_settings_brand_accent_color_hex_check
      check (brand_accent_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
