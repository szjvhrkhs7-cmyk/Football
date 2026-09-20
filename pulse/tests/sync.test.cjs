const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const indexSource = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const serviceWorkerSource = fs.readFileSync(require('node:path').join(__dirname, '../sw.js'), 'utf8');
function fixture() {
  const elements = new Map();
  const timers = new Map(); let timerId = 0;
  const stored = new Map();
  const context = vm.createContext({
    Date, console: { warn() {}, error() {} },
    window: { location: { origin: 'https://example.com', pathname: '/pulse/' } },
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', textContent: '', style: {}, disabled: false, checkValidity: () => true, classList: { add() {}, remove() {}, toggle() {} } });
      return elements.get(id);
    } },
    localStorage: { getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v) },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id)
  });
  const marker = "  if (document.readyState === 'loading')";
  vm.runInContext(source.slice(0, source.indexOf(marker)) + `
    renderAll = () => {};
    subscribeRealtime = () => {};
    globalThis.api = { initCloud, syncBidirectional, pushCloudState, persistState, signIn, resendConfirmation, humanizeAuthError,
      connect(client) { supabaseClient = client; currentUser = { id: 'test-user' }; },
      state: () => state, status: () => cloudStatus,
      plannedExpensesForOverview,
      mutate() { state.settings.defaultBudget = 99; persistState(); }
    };
  })();`, context);
  return { api: context.api, context, elements, timers };
}
function db(read, write) {
  return { from() { return { select() { return this; }, eq() { return this; }, maybeSingle: read, upsert: write }; } };
}
test('a new device downloads the existing budget without uploading an empty state', async () => {
  const f = fixture(); let writes = 0;
  const remote = { meta: { updatedAt: '2026-01-01T00:00:00Z' }, settings: { defaultBudget: 42 }, expenses: [] };
  f.api.connect(db(async () => ({ data: { payload: remote } }), async () => { writes++; return {}; }));
  await f.api.syncBidirectional();
  assert.equal(f.api.state().settings.defaultBudget, 42); assert.equal(writes, 0); assert.equal(f.api.status(), 'online');
});
test('a rejected initial cloud write stays an error instead of showing success', async () => {
  const f = fixture(); f.api.connect(db(async () => ({ data: null }), async () => ({ error: new Error('RLS denied') })));
  await f.api.syncBidirectional(); assert.equal(f.api.status(), 'error');
});
test('edits made during a cloud read are retained and queued', async () => {
  const f = fixture(); let finish;
  f.api.connect(db(() => new Promise(r => finish = r), async () => ({})));
  const syncing = f.api.syncBidirectional(); f.api.mutate();
  finish({ data: { payload: { meta: { updatedAt: '2099-01-01' }, settings: { defaultBudget: 1 } } } });
  await syncing;
  assert.equal(f.api.state().settings.defaultBudget, 99); assert.equal(f.timers.size, 1);
});
test('Auth event returns immediately and defers database calls beyond the Auth lock', async () => {
  const f = fixture(); let callback; let reads = 0;
  f.context.window.supabase = { createClient: () => ({
    ...db(async () => { reads++; return { data: null }; }, async () => ({})),
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: cb => { callback = cb; } }
  }) };
  await f.api.initCloud();
  assert.equal(callback('SIGNED_IN', { user: { id: 'test-user', email: 'test@example.com' } }), undefined);
  assert.equal(reads, 0); assert.equal(f.timers.size, 1);
  await [...f.timers.values()][0](); await new Promise(setImmediate); assert.equal(reads, 1);
});
test('network failure during sign-in releases all auth buttons', async () => {
  const f = fixture(); f.api.connect({ auth: { signInWithPassword: async () => { throw new Error('network'); } } });
  f.context.document.getElementById('cloudEmail').value = 'test@example.com';
  f.context.document.getElementById('cloudPassword').value = 'test-password';
  await f.api.signIn();
  for (const id of ['signInButton', 'signUpButton', 'resendEmailButton']) assert.equal(f.elements.get(id).disabled, false);
});
test('resending uses the signup flow and preserves the application redirect', async () => {
  const f = fixture(); let args;
  f.api.connect({ auth: { resend: async value => { args = value; return {}; } } });
  f.context.document.getElementById('cloudEmail').value = 'test@example.com';
  await f.api.resendConfirmation();
  assert.equal(args.type, 'signup'); assert.equal(args.options.emailRedirectTo, 'https://example.com/pulse/');
  assert.match(f.api.humanizeAuthError('Email address not authorized'), /почтовый сервис/);
});

test('overview keeps every planned expense for the selected month, including overdue ones', () => {
  const f = fixture();
  const expenses = [
    { id: 'past', date: '2026-09-18', status: 'planned' },
    { id: 'today', date: '2026-09-20', status: 'planned' },
    { id: 'future', date: '2026-09-30', status: 'planned' },
    { id: 'paid', date: '2026-09-19', status: 'paid' }
  ];

  assert.deepEqual(
    Array.from(f.api.plannedExpensesForOverview(expenses), expense => expense.id),
    ['past', 'today', 'future']
  );
});

test('versioned app assets match the service worker cache', () => {
  const version = indexSource.match(/app\.js\?v=([^"']+)/)?.[1];
  assert.ok(version);
  assert.match(indexSource, new RegExp(`styles\\.css\\?v=${version}`));
  assert.match(indexSource, new RegExp(`ui-language\\.js\\?v=${version}`));
  assert.match(serviceWorkerSource, new RegExp(`CACHE = 'pulse-v${version.replaceAll('.', '\\.')}';`));
  assert.match(serviceWorkerSource, new RegExp(`app\\.js\\?v=${version.replaceAll('.', '\\.')}`));
});
