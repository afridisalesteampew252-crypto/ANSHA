# Rules

The live repository and production database are the source of truth. Improve incrementally.

## Do not

- Delete working features without approval
- Replace or reset the production database
- DROP tables or columns when ADD/new table can migrate
- Rewrite the application because another architecture is preferred
- Replace authentication without a migration plan
- Remove routes or API endpoints without approval
- Change production environment variables or domains without approval
- Commit `.env.local` or service-role keys
- Force-push or rewrite git history unless explicitly instructed
- Invent tables, APIs, or modules that are not in the repo

## Before schema change

1. Read the current table and dependents
2. Check existing data
3. Write a forward migration
4. Test off production
5. Keep old reads working during rollout
6. Then apply and verify

## Before coding

State what exists, what will change, files, whether database/API is affected, risk, and how it will be tested.

## After coding

Run lint and typecheck (and build/release verify when appropriate). Summarize files, features, database, tests, remaining issues.

## Ask approval before

Destructive migrations, auth replacement, removing major features, production infra/env/domain changes, full frontend or backend replacement, data deletion.

## Surfaces

Public website, staff ERP, and any future customer portal or mobile wrap share one Supabase business database. Do not create a second database.

## Vehicle and requests

Current vehicle/part operational state is `stock_status` (`available`|`reserved`|`sold`). Auction/yard/port and generic request tickets must be designed as additive workflows. See `docs/Database.md` and `docs/Modules.md`.

## Chat

Internal chat and mail already exist. Do not rebuild them. Entity linking is not present; add it without isolating a second messaging system.

## Documentation

`docs/` must describe the running system. Label vision separately. Keep `docs/phase-13-public-redesign.md`.
