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
    window: { PulseLoans: require('../loans.js'), PulseLegacyData: require('../legacy-data.js'), location: { origin: 'https://example.com', pathname: '/pulse/' } },
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
    globalThis.api = { initCloud, syncBidirectional, pushCloudState, persistState, signIn, signUp, resendConfirmation, humanizeAuthError, normalizeState,
      connect(client) { supabaseClient = client; currentUser = { id: 'test-user' }; },
      disconnect() { currentUser = null; setSyncState(''); },
      state: () => state, status: () => cloudStatus,
      account: activateCloudAccount, leaveAccount: deactivateCloudAccount,
      expensesForMonth,
      mutate() { state.settings.defaultBudget = 99; persistState(); }
    };
  })();`, context);
  return { api: context.api, context, elements, timers };
}
function db(read, write) {
  return { from() { let operation = 'read', next;
    return {
      select() { return this; }, eq() { return this; },
      update(value) { operation = 'write'; next = value; return this; },
      insert(value) { operation = 'write'; next = value; return this; },
      async maybeSingle() {
        if (operation === 'read') return read();
        const result = await write(next);
        if (result?.error || result?.data !== undefined) return result;
        return { data: { payload: next.payload, updated_at: next.updated_at } };
      }
    };
  } };
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

test('versioned app assets match the service worker cache', () => {
  const version = indexSource.match(/app\.js\?v=([^"']+)/)?.[1];
  assert.ok(version);
  assert.match(indexSource, new RegExp(`styles\\.css\\?v=${version}`));
  assert.match(indexSource, new RegExp(`loans\\.js\\?v=${version}`));
  assert.match(serviceWorkerSource, new RegExp(`CACHE = 'pulse-v${version.replaceAll('.', '\\.')}';`));
  assert.match(serviceWorkerSource, new RegExp(`app\\.js\\?v=${version.replaceAll('.', '\\.')}`));
});

test('registration validates the email before contacting Auth', async () => {
  const f = fixture(); let calls = 0;
  f.api.connect({ auth: { signUp: async () => { calls++; return {}; } } });
  f.context.document.getElementById('cloudEmail').value = 'invalid';
  f.context.document.getElementById('cloudEmail').checkValidity = () => false;
  f.context.document.getElementById('cloudPassword').value = 'long-password';
  await f.api.signUp();
  assert.equal(calls, 0);
  assert.match(f.elements.get('cloudMessage').textContent, /корректный email/);
});
test('signup normalizes its redirect and does not announce success on an SMTP rejection', async () => {
  const f = fixture(); let args;
  f.api.connect({ auth: { signUp: async value => { args = value; return { error: { code: 'email_address_not_authorized', message: 'Forbidden' } }; } } });
  f.context.document.getElementById('cloudEmail').value = 'test@example.com';
  f.context.document.getElementById('cloudPassword').value = 'long-password';
  await f.api.signUp();
  assert.equal(args.options.emailRedirectTo, 'https://example.com/pulse/');
  assert.match(f.elements.get('cloudMessage').textContent, /почтовый сервис/);
  assert.equal(f.elements.get('signUpButton').disabled, false);
});
test('cloud downloads preserve credit records, including paid months', async () => {
  const f = fixture();
  const loans = [{ id: 'a', title: 'Кредит', payment: 50.25, firstDate: '2026-09-21', paidMonths: ['2026-09'] }];
  f.api.connect(db(async () => ({ data: { payload: { meta: { updatedAt: '2026-09-21T10:00:00Z' }, loans } } }), async () => ({})));
  await f.api.syncBidirectional();
  assert.equal(f.api.state().loans[0].payment, 50.25);
  assert.equal(f.api.state().loans[0].paidMonths[0], '2026-09');
});

test('cloud downloads preserve mandatory payments', async () => {
  const f = fixture();
  const mandatoryPayments = [
    { id: 'rent', title: 'Аренда', amount: 45000, day: 5 },
    { id: 'internet', title: 'Интернет', amount: 900, day: 20 }
  ];
  f.api.connect(db(async () => ({ data: { payload: { meta: { updatedAt: '2026-09-22T10:00:00Z' }, mandatoryPayments } } }), async () => ({})));
  await f.api.syncBidirectional();
  assert.equal(f.api.state().mandatoryPayments.length, 2);
  assert.equal(f.api.state().mandatoryPayments[0].amount, 45000);
  assert.equal(f.api.state().mandatoryPayments[1].day, 20);
});

test('a failed local download keeps the old state and does not disable later uploads', async () => {
  const f=fixture();let writes=0;
  f.api.connect(db(async()=>({data:{payload:{meta:{updatedAt:'2099-01-01'},settings:{defaultBudget:7}}}}),async()=>{writes++;return {};}));
  const original=f.context.localStorage.setItem;
  f.context.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
  await f.api.syncBidirectional();
  assert.equal(f.api.state().settings.defaultBudget,0);
  assert.equal(f.api.status(),'error');
  f.context.localStorage.setItem=original;f.api.mutate();
  assert.equal(f.timers.size,1);
});

test('an upload completing after sign-out cannot show an online state',async()=>{
 const f=fixture();let finish;
 f.api.connect(db(async()=>({data:null}),()=>new Promise(resolve=>finish=resolve)));
 const upload=f.api.pushCloudState();
 await new Promise(setImmediate);
 vm.runInContext('globalThis.api.disconnect()',f.context);
 finish({});await upload;assert.notEqual(f.api.status(),'online');
});

test('network errors explain that local data is retained',async()=>{
 const f=fixture();f.api.connect(db(async()=>{throw Object.assign(new Error('Failed to fetch'),{code:'cloud_timeout'});},async()=>({})));
 await f.api.syncBidirectional();assert.match(f.elements.get('cloudMessage').textContent,/время|подключ|сервер/i);assert.match(f.elements.get('cloudMessage').textContent,/устройств|локальн/i);
});

test('retry after failed session initialization creates a working client',async()=>{
 const f=fixture();let attempts=0;
 f.context.window.supabase={createClient:()=>{attempts++;return {auth:{getSession:async()=>{if(attempts===1)throw new Error('network');return {data:{session:null}};},onAuthStateChange(){}}};}};
 await f.api.initCloud();await f.api.initCloud();assert.equal(attempts,2);
});

test('initial forced upload cannot announce success after sign-out',async()=>{
 const f=fixture();let finish;
 f.api.connect(db(async()=>({data:null}),()=>new Promise(resolve=>finish=resolve)));
 const syncing=f.api.syncBidirectional();await new Promise(setImmediate);f.api.disconnect();finish({});await syncing;
 assert.notEqual(f.api.status(),'online');
});

test('new edits during forced upload stay pending until uploaded',async()=>{
 const f=fixture();let finish;
 f.api.connect(db(async()=>({data:null}),()=>new Promise(resolve=>finish=resolve)));
 const syncing=f.api.syncBidirectional();await new Promise(setImmediate);f.api.mutate();finish({});await syncing;
 assert.notEqual(f.api.status(),'online');assert.equal(f.api.state().settings.defaultBudget,99);assert.equal(f.timers.size,1);
});

test('cloud payload stores independent unplanned expenses for the signed-in user',async()=>{
 const f=fixture();
 const row={id:'unplanned-01',amount:99.5,categoryId:'food',date:'2026-10-19',comment:'Такси'};
 f.api.state().unplannedExpenses.push(row);
 let saved;
 f.api.connect(db(async()=>({data:null}),async data=>{saved=data;return {};}));
 await f.api.pushCloudState(true);
 assert.equal(saved.user_id,'test-user');
 assert.equal(saved.payload.unplannedExpenses.length,1);
 assert.equal(saved.payload.unplannedExpenses[0].id,'unplanned-01');
 assert.equal(saved.payload.expenses.length,0);
});
test('cloud download restores unplanned records without duplicating stable ids',async()=>{
 const f=fixture();
 const remote={meta:{updatedAt:'2099-01-01T00:00:00Z'},settings:{defaultBudget:60000},expenses:[],
  unplannedExpenses:[
   {id:'u1',amount:100,date:'2026-10-19',categoryId:'food',updatedAt:'2026-10-19T10:00:00Z'},
   {id:'u1',amount:150,date:'2026-10-19',categoryId:'food',updatedAt:'2026-10-19T12:00:00Z'}
  ]};
 f.api.connect(db(async()=>({data:{payload:remote}}),async()=>({})));
 await f.api.syncBidirectional();
 assert.equal(f.api.state().unplannedExpenses.length,1);
 assert.equal(f.api.state().unplannedExpenses[0].amount,150);
 assert.equal(f.api.state().settings.defaultBudget,60000);
 assert.equal(f.api.state().expenses.length,0);
});


function sharedCloud(initial) {
  let stored = initial ? {payload: structuredClone(initial),updated_at:'2026-10-22T08:00:00.000Z'} : null;
  let sequence = 0;
  return {
    snapshot: () => structuredClone(stored),
    client() { return {
      from() {
        let action = 'read', written, expected;
        return {
          select() { return this; },
          eq(field, value) { if (field === 'updated_at') expected = value; return this; },
          insert(value) { action = 'insert'; written = value; return this; },
          update(value) { action = 'update'; written = value; return this; },
          async maybeSingle() {
            await new Promise(resolve => setImmediate(resolve));
            if (action === 'read') return {data:structuredClone(stored)};
            if (action === 'insert' && stored) return {error:{code:'23505'}};
            if (action === 'update' && (!stored || stored.updated_at !== expected)) return {data:null};
            stored = {payload:structuredClone(written.payload),updated_at:new Date(Date.parse(written.updated_at)+ ++sequence).toISOString()};
            return {data:structuredClone(stored)};
          }
        };
      }
    }; }
  };
}
test('simultaneous edits on two devices preserve both distinct expenses', async () => {
  const cloud = sharedCloud({meta:{updatedAt:'2026-10-22T08:00:00Z'},expenses:[],unplannedExpenses:[]});
  const left=fixture(),right=fixture();
  left.api.connect(cloud.client());right.api.connect(cloud.client());
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  left.api.state().unplannedExpenses.push({id:'u-left',amount:100,date:'2026-10-22',categoryId:'food',comment:'A'});
  right.api.state().unplannedExpenses.push({id:'u-right',amount:200,date:'2026-10-22',categoryId:'food',comment:'B'});
  left.api.persistState();right.api.persistState();
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  assert.deepEqual(cloud.snapshot().payload.unplannedExpenses.map(x=>x.id).sort(),['u-left','u-right']);
});
test('an offline delete and a simultaneous independent addition both survive', async () => {
  const cloud=sharedCloud({meta:{updatedAt:'2026-10-22T08:00:00Z'},unplannedExpenses:[
    {id:'old',amount:100,date:'2026-10-20',categoryId:'food'}]});
  const left=fixture(),right=fixture();
  left.api.connect(cloud.client());right.api.connect(cloud.client());
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  left.api.state().unplannedExpenses.splice(0,1);
  right.api.state().unplannedExpenses.push({id:'new',amount:50,date:'2026-10-22',categoryId:'food'});
  left.api.persistState();right.api.persistState();
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  assert.deepEqual(cloud.snapshot().payload.unplannedExpenses.map(x=>x.id),['new']);
});


test('section assignments survive cloud round trips and independent device edits', async () => {
 const cloud=sharedCloud({meta:{updatedAt:'2026-10-22T08:00:00Z'},expenses:[
  {id:'home-plan',title:'Квартира',categoryId:'food',sectionId:'home',amount:100,date:'2026-10-22'},
  {id:'credit-plan',title:'Кредит',categoryId:'home',sectionId:'credit',amount:200,date:'2026-10-22'}]});
 const left=fixture(),right=fixture();left.api.connect(cloud.client());right.api.connect(cloud.client());
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 assert.equal(left.api.state().expenses.find(e=>e.id==='home-plan').sectionId,'home');
 left.api.state().expenses.find(e=>e.id==='home-plan').sectionId='other';
 left.api.state().expenses.find(e=>e.id==='home-plan').updatedAt=new Date().toISOString();left.api.persistState();
 right.api.state().expenses.find(e=>e.id==='credit-plan').title='Новый заголовок';
 right.api.state().expenses.find(e=>e.id==='credit-plan').updatedAt=new Date().toISOString();right.api.persistState();
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 const saved=cloud.snapshot().payload.expenses;
 assert.equal(saved.find(e=>e.id==='home-plan').sectionId,'other');
 assert.equal(saved.find(e=>e.id==='credit-plan').sectionId,'credit');
 assert.equal(saved.find(e=>e.id==='credit-plan').title,'Новый заголовок');
 await left.api.syncBidirectional();assert.equal(left.api.state().expenses.find(e=>e.id==='credit-plan').sectionId,'credit');
});

test('two accounts on the same browser retain separate local budgets', () => {
  const f=fixture();
  f.api.account('account-a');
  f.api.state().settings.defaultBudget=41000;
  f.api.persistState();
  f.api.account('account-b');
  assert.equal(f.api.state().settings.defaultBudget,0);
  f.api.state().settings.defaultBudget=86000;
  f.api.persistState();
  f.api.account('account-a');
  assert.equal(f.api.state().settings.defaultBudget,41000);
  f.api.account('account-b');
  assert.equal(f.api.state().settings.defaultBudget,86000);
  f.api.leaveAccount();
  assert.equal(f.api.state().settings.defaultBudget,0);
});

test('simultaneous partial payments on the same plan survive retries and repeated sync', async()=>{
 const cloud=sharedCloud({meta:{updatedAt:'2026-10-22T08:00:00Z'},expenses:[{id:'rent',title:'Rent',amount:10000,date:'2026-10-22',status:'planned'}]});
 const left=fixture(),right=fixture();left.api.connect(cloud.client());right.api.connect(cloud.client());
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 const timestamp='2026-10-22T10:00:00Z';
 left.api.state().expenses[0].payments.push({id:'a',amount:4000,date:'2026-10-22',updatedAt:timestamp,createdAt:timestamp,voided:false});
 right.api.state().expenses[0].payments.push({id:'b',amount:3000,date:'2026-10-22',updatedAt:timestamp,createdAt:timestamp,voided:false});
 left.api.persistState();right.api.persistState();
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 const expense=cloud.snapshot().payload.expenses[0];
 assert.deepEqual(expense.payments.map(p=>p.id).sort(),['a','b']);
 assert.equal(expense.payments.reduce((sum,p)=>sum+p.amount,0),7000);
 assert.equal(expense.status,'planned');
});

test('plan cancellation survives a later independent payment on the other device',async()=>{
 const cloud=sharedCloud({meta:{updatedAt:'2026-10-22T08:00:00Z'},expenses:[{id:'rent',title:'Rent',amount:10000,date:'2026-10-22',status:'planned'}]});
 const left=fixture(),right=fixture();left.api.connect(cloud.client());right.api.connect(cloud.client());
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 left.api.state().expenses[0].cancelled=true;left.api.state().expenses[0].updatedAt='2026-10-22T10:00:00Z';
 right.api.state().expenses[0].payments.push({id:'b',amount:3000,date:'2026-10-22',updatedAt:'2026-10-22T11:00:00Z',createdAt:'2026-10-22T11:00:00Z',voided:false});
 right.api.state().expenses[0].updatedAt='2026-10-22T11:00:00Z';
 left.api.persistState();right.api.persistState();
 await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
 const expense=cloud.snapshot().payload.expenses[0];
 assert.equal(expense.cancelled,true);assert.equal(expense.payments.length,1);assert.equal(expense.payments[0].amount,3000);
});


test('completion flags persist through cloud round trips and independent edits to separate records', async()=>{
  const cloud=sharedCloud({meta:{updatedAt:'2026-10-22T08:00:00Z'},expenses:[
    {id:'first',title:'First',amount:100,date:'2026-10-07',completed:false},
    {id:'second',title:'Second',amount:200,date:'2026-10-22',completed:false}]});
  const left=fixture(),right=fixture();
  left.api.connect(cloud.client());right.api.connect(cloud.client());
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  left.api.state().expenses.find(e=>e.id==='first').completed=true;
  left.api.state().expenses.find(e=>e.id==='first').updatedAt=new Date().toISOString();
  left.api.persistState();
  right.api.state().expenses.find(e=>e.id==='second').completed=true;
  right.api.state().expenses.find(e=>e.id==='second').updatedAt=new Date().toISOString();
  right.api.persistState();
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  await Promise.all([left.api.syncBidirectional(),right.api.syncBidirectional()]);
  for(const expense of cloud.snapshot().payload.expenses) assert.equal(expense.completed,true);
  assert.equal(left.api.state().expenses.find(e=>e.id==='second').completed,true);
  assert.equal(right.api.state().expenses.find(e=>e.id==='first').completed,true);
});
