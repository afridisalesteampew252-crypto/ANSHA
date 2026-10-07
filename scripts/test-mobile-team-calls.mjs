/* eslint-disable react-hooks/rules-of-hooks -- React hooks are replaced with an SSR contract harness below. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(compiled.outputText, { exports, URL, ...globals });
  return exports;
}

const { teamCallUrl, sharedLocationUrl } = load('lib/team-calls.ts');
const id = '3f445eb5-3e2f-4a3d-bade-4707af59f461';
const voice = new URL(teamCallUrl('https://calls.example.com/team/', id, 'voice'));
assert.equal(voice.pathname, `/team/ANSHA-${id}`);
assert.ok(voice.hash.includes('startWithVideoMuted=true'));
assert.ok(teamCallUrl('https://meet.jit.si', id, 'video').includes('startWithVideoMuted=false'));
for (const base of ['javascript:alert(1)', 'http://calls.example.com', 'https://user:secret@example.com', 'https://example.com/?room=shared', 'https://example.com/#room']) {
  assert.throws(() => teamCallUrl(base, id, 'video'));
}
assert.throws(() => teamCallUrl('https://meet.jit.si', '../shared', 'video'));
assert.ok(sharedLocationUrl(24.8607, 67.0011).includes('mlat=24.860700&mlon=67.001100'));
for (const pair of [[91, 0], [0, 181], [NaN, 0], [0, Infinity]]) {
  assert.throws(() => sharedLocationUrl(...pair));
}

const { safeMobileRoute } = load('lib/capacitor/safe-mobile-route.ts');
const { safeAdminRoute } = load('lib/capacitor/safe-admin-route.ts');
assert.equal(safeMobileRoute('/portal/invoices?invoice=123'), '/portal/invoices?invoice=123');
assert.equal(safeMobileRoute('/portal/notifications'), '/portal/notifications');
assert.equal(safeMobileRoute('https://evil.example/portal/support'), '/mobile');
assert.equal(safeMobileRoute('/admin/customers'), '/mobile');
assert.equal(safeMobileRoute('//evil.example/mobile'), '/mobile');
assert.equal(safeMobileRoute('/portals'), '/mobile');
assert.equal(safeAdminRoute('/admin/system-health'), '/admin/system-health');
assert.equal(safeAdminRoute('javascript:alert(1)'), '/admin/dashboard');
assert.equal(safeAdminRoute('/portal/invoices'), '/admin/dashboard');

// React requires a stable server snapshot reference during SSR/hydration.
let snapshotReads = 0;
const { usePwaInstall } = load('components/pwa/use-pwa-install.ts', {
  require: (name) => name === 'react' ? {
    useSyncExternalStore: (_subscribe, _getSnapshot, getServerSnapshot) => {
      const first = getServerSnapshot();
      assert.equal(getServerSnapshot(), first);
      snapshotReads += 2;
      return first;
    },
    useState: (value) => [value, () => {}], useEffect: () => {}, useCallback: (callback) => callback,
  } : { isNativeCapacitorRuntime: () => false },
});
assert.equal(usePwaInstall().installed, false);
assert.equal(snapshotReads, 2);

let effect;
let reloads = 0;
const workerEvents = {};
const { RegisterServiceWorker } = load('components/pwa/register-service-worker.tsx', {
  require: (name) => name === 'react' ? {
    useEffect: (callback) => { effect = callback; }, useState: (value) => [value, () => {}],
  } : { isNativeCapacitorRuntime: () => false },
  window: { location: { reload: () => { reloads += 1; } } },
  process: { env: { NODE_ENV: 'production' } },
  navigator: { serviceWorker: {
    controller: null, addEventListener: (event, callback) => { workerEvents[event] = callback; },
    removeEventListener: () => {}, register: async () => ({ waiting: null, installing: null, addEventListener: () => {} }),
  } },
});
RegisterServiceWorker();
const cleanup = effect();
workerEvents.controllerchange();
assert.equal(reloads, 0, 'First install must preserve ongoing user input.');
workerEvents.controllerchange();
workerEvents.controllerchange();
assert.equal(reloads, 1, 'A worker update reloads once.');
cleanup();
console.log('Mobile deep links, call invitations, and location checks passed.');
