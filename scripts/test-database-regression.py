#!/usr/bin/env python3
"""Replay app migrations and role tests in a disposable PostgreSQL container.

This fallback checks SQL/RLS/RPC behavior, not Supabase HTTP, Realtime or Storage
services. It never accepts a database URL. Use `supabase test db` for the full
service-stack gate. The named container must be an explicitly local test DB.
"""
from pathlib import Path
import argparse
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--container", default="ansha-regression-db")
parser.add_argument("--database", default="ansha_regression")
parser.add_argument("--bootstrap", action="store_true", help="initialize an EMPTY disposable database")
parser.add_argument("--apply-from", help="resume a disposable replay at this migration filename")
args = parser.parse_args()
if not re.fullmatch(r"ansha-[a-z0-9-]*regression[a-z0-9-]*", args.container):
    parser.error("container name must identify an ANSHA regression database")
if not re.fullmatch(r"ansha_[a-z0-9_]*regression[a-z0-9_]*", args.database):
    parser.error("database name must identify an ANSHA regression database")

def sql_run(sql):
    result = subprocess.run(["docker", "exec", "-i", args.container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", args.database], input=sql, text=True, capture_output=True)
    if result.returncode:
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    return result.stdout

if args.bootstrap:
    if sql_run("SELECT count(*) FROM pg_tables WHERE schemaname='public';").strip().splitlines()[2].strip() != "0":
        parser.error("bootstrap requires an empty public schema; use a fresh disposable container")
    sql_run((ROOT / "tests/database/postgres-bootstrap.sql").read_text())
if args.bootstrap or args.apply_from:
    for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        if args.apply_from and migration.name < args.apply_from:
            continue
        source = migration.read_text()
        # pg_net is an external delivery integration and unavailable on vanilla
        # PostgreSQL. Functions/triggers remain installed; absent Vault secrets
        # deliberately exercise their normal no-delivery branch.
        source = re.sub(r"CREATE EXTENSION IF NOT EXISTS pg_net\s*;", "-- pg_net transport excluded in PostgreSQL fallback", source, flags=re.I)
        print(f"Applying {migration.name}", flush=True)
        sql_run("BEGIN;\n" + source + "\nCOMMIT;")
    print("All application migrations applied.")

tests = sorted((ROOT / "tests/database").glob("*.test.sql"))
for test in tests:
    print(f"Running {test.name}", flush=True)
    print(sql_run(test.read_text()).strip())
print(f"Passed {len(tests)} SQL behavior suites.")
