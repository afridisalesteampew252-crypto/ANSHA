import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');

function loadTypeScript(filename, imports, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require(name) {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
    ...globals,
  }, { filename });
  return exports;
}

const rbac = loadTypeScript('lib/admin-rbac.ts', {});
const userId = '92000000-0000-4000-8000-000000000001';
let identity;
let claimsReads;
let profileReads;
const refreshHeaders = {
  'cache-control': 'private, no-store',
  pragma: 'no-cache',
  expires: '0',
};
const refreshCookie = { name: 'fixture-session', value: 'refreshed-session', options: { httpOnly: true, path: '/' } };
const { proxy } = loadTypeScript('proxy.ts', {
  'next/server': { NextResponse },
  '@/lib/admin-rbac': rbac,
  '@supabase/ssr': {
    createServerClient(url, key, options) {
      assert.equal(url, 'https://fixture.supabase.invalid');
      assert.equal(key, 'fixture-publishable-key');
      return {
        auth: {
          async getClaims() {
            claimsReads += 1;
            if (identity.refresh) options.cookies.setAll([refreshCookie], refreshHeaders);
            return { data: { claims: identity.authenticated ? { sub: userId } : {} }, error: null };
          },
        },
        from(table) {
          assert.equal(table, 'admin_profiles');
          const query = {
            select(columns) {
              assert.equal(columns, 'id, is_active, role');
              return query;
            },
            eq(column, value) {
              assert.equal(column, 'id');
              assert.equal(value, userId);
              return query;
            },
            async maybeSingle() {
              profileReads += 1;
              return { data: identity.profile, error: null };
            },
          };
          return query;
        },
      };
    },
  },
}, {
  URL,
  process: { env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.invalid',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
  } },
});

async function request(path, fixture) {
  identity = { refresh: true, ...fixture };
  claimsReads = 0;
  profileReads = 0;
  const result = await proxy(new NextRequest(new URL(path, 'https://admin.example.invalid')));
  assert.equal(claimsReads, 1, 'Every request validates its auth claims');
  assert.equal(profileReads, identity.authenticated ? 1 : 0, 'Only authenticated users cause a profile lookup');
  if (identity.refresh) {
    assert.equal(result.cookies.get(refreshCookie.name)?.value, refreshCookie.value,
      'A refreshed session cookie survives both redirects and ordinary responses');
    for (const [name, value] of Object.entries(refreshHeaders)) {
      assert.equal(result.headers.get(name), value, `Session cache header ${name} must survive`);
    }
  }
  return result;
}

function assertNext(response, label) {
  assert.equal(response.headers.get('location'), null, `${label}: the login page must not redirect`);
  assert.equal(response.headers.get('x-middleware-next'), '1', `${label}: the page can render its recovery UI`);
}

function redirectUrl(response, pathname) {
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://admin.example.invalid');
  assert.equal(location.pathname, pathname);
  return location;
}

const inactive = { authenticated: true, profile: { id: userId, is_active: false, role: 'admin' } };
for (const path of ['/admin', '/admin?error=inactive', '/admin?error=unauthorized&from=dashboard']) {
  assertNext(await request(path, inactive), `Inactive account at ${path}`);
}
const inactiveLogin = redirectUrl(await request('/admin/dashboard?period=2026-10', inactive), '/admin');
assert.equal(inactiveLogin.searchParams.get('error'), 'inactive');
assertNext(await request(`${inactiveLogin.pathname}${inactiveLogin.search}`, inactive),
  'Following an inactive-account redirect terminates after one hop');
redirectUrl(await request('/admin/reports/financial', inactive), '/admin');

const missingProfile = { authenticated: true, profile: null };
assertNext(await request('/admin', missingProfile), 'Authenticated account without an admin profile');
assertNext(await request('/admin?error=unauthorized', missingProfile), 'Unauthorized login with an existing error');
const unauthorizedLogin = redirectUrl(await request('/admin/dashboard', missingProfile), '/admin');
assert.equal(unauthorizedLogin.searchParams.get('error'), 'unauthorized');
assertNext(await request(`${unauthorizedLogin.pathname}${unauthorizedLogin.search}`, missingProfile),
  'An account without a profile can render login after one redirect');

const anonymous = { authenticated: false, profile: null };
assertNext(await request('/admin?error=inactive', anonymous), 'Anonymous login remains available');
const anonymousLogin = redirectUrl(await request('/admin/dashboard?period=2026-10', anonymous), '/admin');
assert.equal(anonymousLogin.search, '', 'Protected-page query parameters do not become login errors');
assertNext(await request(anonymousLogin.pathname, anonymous), 'Anonymous protected navigation terminates at login');

const activeAdmin = { authenticated: true, profile: { id: userId, is_active: true, role: 'admin' } };
const dashboard = redirectUrl(await request('/admin?error=inactive', activeAdmin), '/admin/dashboard');
assert.equal(dashboard.search, '', 'Successful login discards stale error parameters');
assertNext(await request('/admin/dashboard', activeAdmin), 'An active admin can open the dashboard');
assertNext(await request('/admin/users', activeAdmin), 'An active admin retains access to admin-only pages');
const activeSales = { authenticated: true, profile: { id: userId, is_active: true, role: 'sales' } };
redirectUrl(await request('/admin/users', activeSales), '/admin/dashboard');
assertNext(await request('/admin/dashboard', activeSales), 'Role restrictions still land on an accessible dashboard');

console.log('Admin recovery checks passed: inactive/unauthorized login ends redirect chains, active and anonymous access remain guarded, and session refresh survives.');
