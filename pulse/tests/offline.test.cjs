const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
function worker({ offline = false } = {}) {
  const events = {}; const writes = []; const requests = [];
  const index = new Response('<html>offline shell</html>');
  const context = {
    URL, Response, location: { origin: 'https://example.com' },
    self: { location: 'https://example.com/pulse/sw.js', addEventListener: (name, cb) => events[name] = cb, clients: { claim: async () => {} } },
    caches: { match: async key => key === './index.html' ? index : undefined, open: async () => ({ put: async (...args) => writes.push(args) }) },
    fetch: async request => { requests.push(request); if (offline) throw new Error('offline'); return new Response('script'); }
  };
  vm.runInNewContext(code, context);
  return { events, writes, requests };
}
test('offline startup with a build query resolves the canonical app shell', async () => {
  const w = worker({ offline: true }); let response;
  w.events.fetch({ request: { url: 'https://example.com/pulse/?build=new', method: 'GET', mode: 'navigate' }, respondWith: value => response = value });
  assert.match(await (await response).text(), /offline shell/);
});
test('authentication callback URLs never enter the offline cache', async () => {
  const w = worker(); let response;
  w.events.fetch({ request: { url: 'https://example.com/pulse/?code=example-test-code', method: 'GET', mode: 'navigate' }, respondWith: value => response = value });
  await response;
  assert.equal(w.writes.length, 0);
  assert.equal(w.requests.length, 0);
});
test('worker leaves other apps and cloud requests alone', () => {
  const w = worker();
  for (const url of ['https://example.com/night-match/', 'https://cloud.example.com/auth/v1/user']) {
    w.events.fetch({ request: { url, method: 'GET' }, respondWith() { assert.fail('must not intercept'); } });
  }
});
test('every precached asset exists, including the bundled auth library', () => {
  const assets = code.match(/const APP_SHELL = \[([^\]]+)\]/)[1].match(/'[^']+'/g).map(value => value.slice(1, -1));
  for (const asset of assets) assert.ok(fs.existsSync(path.join(__dirname, '..', asset.split('?')[0])), asset);
  assert.ok(assets.includes('./vendor/supabase-2.45.4.js'));
});
