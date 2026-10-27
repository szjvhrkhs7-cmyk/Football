const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
async function app(t, saved, mockViewport = false) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/pulse/', runScripts: 'outside-only', virtualConsole: vc });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.defineProperty(w.navigator, 'onLine', { value: false });
  w.scrollTo = () => {};
  if (mockViewport) {
    const viewport = new w.EventTarget(); viewport.height = w.innerHeight; viewport.offsetTop = 0;
    Object.defineProperty(w, 'visualViewport', { value: viewport });
  }
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (saved) w.localStorage.setItem('pulse-finance-v1', saved);
  w.eval(fs.readFileSync(path.join(root, 'loans.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'legacy-data.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const $ = id => w.document.getElementById(id);
  const click = selector => w.document.querySelector(selector).click();
  const submit = id => $(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const read = () => JSON.parse(w.localStorage.getItem('pulse-finance-v1'));
  t.after(() => assert.deepEqual(errors.map(e => e.message), []));
  return { w, $, click, submit, read };
}

function add(a, title, amount, date) {
  a.click('[data-open-expense]'); a.$('expenseTitle').value=title; a.$('expenseAmount').value=amount;
  if(date) a.$('expenseDate').value=date;
  a.submit('expenseForm');
}
function budget(a, amount) {a.$('openBudgetButton').click();a.$('budgetInput').value=amount;a.submit('budgetForm');}
function money(a,id) {return a.$(id).textContent.replace(/\u00a0/g,' ');}
test('budget subtracts every plan including legacy paid and partially paid items, but excludes cancelled and other months',async t=>{
 const month=new Date().toISOString().slice(0,7);
 const a=await app(t,JSON.stringify({settings:{defaultBudget:20000},expenses:[
 {id:'a',title:'План',amount:5000,date:month+'-01'},
 {id:'b',title:'Оплачено раньше',amount:3000,date:month+'-02',status:'paid'},
 {id:'c',title:'Частичная',amount:2000,date:month+'-03',payments:[{id:'p',amount:500,date:month+'-03'}]},
 {id:'d',title:'Отменённая',amount:1000,date:month+'-04',cancelled:true},
 {id:'e',title:'Другой месяц',amount:1000,date:'2020-01-01'}]}));
 assert.equal(money(a,'availableAmount'),'10 000 ₽');
 assert.equal(a.$('upcomingList').querySelectorAll('[data-expense-id]').length,3);
 a.$('openBudgetButton').click();assert.equal(money(a,'budgetPlannedAmount'),'10 000 ₽');assert.equal(money(a,'budgetRemainingAmount'),'10 000 ₽');
});
test('only the plan and profile screens remain, with no analytics, payment controls or extra navigation',async t=>{
 const a=await app(t);
 assert.deepEqual([...a.w.document.querySelectorAll('[data-screen]')].map(x=>x.dataset.screen),['overview','settings']);
 assert.equal(a.w.document.querySelector('[data-nav="analytics"]'),null);
 assert.equal(a.$('expensePaid'),null);assert.equal(a.$('overviewCalendar'),null);
 assert.equal(a.$('plannedHistoryButton'),null);assert.equal(a.$('plannedPaymentDialog'),null);
 a.$('profileButton').click();assert.equal(a.w.document.querySelector('.screen.active').dataset.screen,'settings');
 a.click('[data-screen="settings"] [data-nav="overview"]');
 assert.equal(a.w.document.querySelector('.screen.active').dataset.screen,'overview');
});
test('create edit delete undo and reload keep the budget in step',async t=>{
 const a=await app(t);budget(a,'10000');add(a,'Аренда','2500.25');
 assert.equal(money(a,'availableAmount'),'7 499,75 ₽');
 a.click('[data-expense-id]');a.$('expenseAmount').value='3000.50';a.submit('expenseForm');
 assert.equal(money(a,'availableAmount'),'6 999,5 ₽');
 const b=await app(t,a.w.localStorage.getItem('pulse-finance-v1'));
 assert.equal(money(b,'availableAmount'),'6 999,5 ₽');
 b.click('[data-expense-id]');b.$('deleteExpenseButton').click();assert.equal(money(b,'availableAmount'),'10 000 ₽');
 b.click('#toast button');assert.equal(money(b,'availableAmount'),'6 999,5 ₽');
});
test('overspending stays negative and editing a legacy paid plan preserves its payment history',async t=>{
 const month=new Date().toISOString().slice(0,7);
 const a=await app(t,JSON.stringify({settings:{defaultBudget:100},expenses:[{id:'p',title:'Старая',amount:200,date:month+'-01',status:'paid'}]}));
 assert.equal(money(a,'availableAmount'),'-100 ₽');assert.match(a.$('budgetAlert').textContent,/100/);
 a.click('[data-expense-id]');a.$('expenseAmount').value='50';a.submit('expenseForm');
 assert.equal(a.$('expenseDialog').open,false);assert.equal(money(a,'availableAmount'),'50 ₽');
 assert.equal(a.read().expenses[0].payments[0].amount,200);
});
test('month budgets remain independent and switching years works',async t=>{
 const a=await app(t);const initial=a.$('overviewMonthLabel').textContent;
 budget(a,'1000');add(a,'Этот месяц','100');a.$('overviewNextMonth').click();budget(a,'500');add(a,'Следующий','200');
 assert.equal(money(a,'availableAmount'),'300 ₽');a.$('overviewPrevMonth').click();assert.equal(money(a,'availableAmount'),'900 ₽');
 assert.equal(a.$('overviewMonthLabel').textContent,initial);assert.match(a.$('upcomingList').textContent,/Этот месяц/);assert.doesNotMatch(a.$('upcomingList').textContent,/Следующий/);
});
test('invalid amounts and dates do not create entries, user titles render as text',async t=>{
 const a=await app(t);budget(a,'100');
 a.click('[data-open-expense]');a.$('expenseTitle').value='Трата';a.$('expenseAmount').value='-5';a.submit('expenseForm');assert.ok(a.$('expenseError').textContent);
 a.$('expenseAmount').value='10';a.$('expenseDate').value='';a.submit('expenseForm');assert.equal(a.read().expenses.length,0);
 a.$('expenseDate').value=new Date().toISOString().slice(0,10);a.$('expenseTitle').value='<img src=x onerror=alert(1)>';a.submit('expenseForm');
 assert.equal(a.$('upcomingList').querySelector('img'),null);assert.match(a.$('upcomingList').textContent,/<img/);
});
test('failed storage retains the draft without partial changes',async t=>{
 const a=await app(t);budget(a,'1000');
 a.click('[data-open-expense]');a.$('expenseTitle').value='Трата';a.$('expenseAmount').value='100';
 const original=a.w.Storage.prototype.setItem;a.w.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};
 a.submit('expenseForm');assert.equal(a.$('expenseDialog').open,true);assert.equal(a.read().expenses.length,0);
 a.w.Storage.prototype.setItem=original;a.submit('expenseForm');assert.equal(a.read().expenses.length,1);assert.equal(money(a,'availableAmount'),'900 ₽');
});
test('obsolete collections survive saves and reload without affecting the budget',async t=>{
 const a=await app(t,JSON.stringify({settings:{defaultBudget:1000},unplannedExpenses:[{id:'u',amount:900,date:'2026-10-01'}],loans:[{id:'l',title:'Кредит',balance:5000,payment:500,firstDate:'2026-10-01'}],mandatoryPayments:[{id:'m',title:'Шаблон',amount:300,day:1}]}));
 budget(a,'2000');add(a,'План','500');const data=a.read();assert.equal(data.unplannedExpenses[0].id,'u');assert.equal(data.loans[0].id,'l');assert.equal(data.mandatoryPayments[0].id,'m');
 const b=await app(t,JSON.stringify(data));assert.equal(money(b,'availableAmount'),'1 500 ₽');
});
test('new users start with an empty budget, and categories can still be created in the expense form',async t=>{
 const a=await app(t);assert.equal(money(a,'budgetAmount'),'0 ₽');
 a.click('[data-open-expense]');a.$('plannedCreateCategory').click();a.$('categoryName').value='Семья';a.click('[data-category-emoji="✈️"]');a.submit('categoryForm');
 a.$('expenseTitle').value='Поездка';a.$('expenseAmount').value='100';a.submit('expenseForm');assert.match(a.$('upcomingList').textContent,/Семья/);
});
test('all plans remain editable in the single list with long names and no payment buttons',async t=>{
 const a=await app(t);budget(a,'10000');for(let i=0;i<12;i++)add(a,'Очень длинное название запланированной покупки '+i,'100');
 assert.equal(a.$('upcomingList').querySelectorAll('[data-expense-id]').length,12);
 assert.equal(a.$('upcomingList').querySelector('[data-pay-expense],[data-complete-expense]'),null);
 assert.equal(money(a,'availableAmount'),'8 800 ₽');
});

const section = (a, id) => a.w.document.querySelector(`[data-expense-section="${id}"]`);
test('three open sections migrate legacy categories and total only active plans in the selected month', async t => {
 const month=new Date().toISOString().slice(0,7);
 const a=await app(t,JSON.stringify({settings:{defaultBudget:10000,categories:[
  {id:'home',name:'Квартира'},{id:'custom-loan',name:'Кредиты'},{id:'food',name:'Продукты'}]},expenses:[
  {id:'rent',title:'Аренда',categoryId:'home',amount:1000.25,date:month+'-01'},
  {id:'loan',title:'Платёж',categoryId:'custom-loan',amount:2000.50,date:month+'-02'},
  {id:'food',title:'Еда',categoryId:'food',amount:300,date:month+'-03'},
  {id:'explicit',title:'Переопределение',categoryId:'home',sectionId:'other',amount:400,date:month+'-04'},
  {id:'invalid',title:'Неизвестный раздел',categoryId:'food',sectionId:'<script>',amount:50,date:month+'-05'},
  {id:'cancelled',title:'Отменено',categoryId:'home',cancelled:true,amount:9000,date:month+'-01'},
  {id:'old',title:'Прошлый месяц',categoryId:'home',amount:9000,date:'2020-01-01'}]}));
 assert.deepEqual([...a.w.document.querySelectorAll('[data-expense-section]')].map(e=>e.dataset.expenseSection),['home','credit','other']);
 assert.equal(section(a,'home').querySelectorAll('[data-expense-id]').length,1);
 assert.equal(section(a,'credit').querySelectorAll('[data-expense-id]').length,1);
 assert.equal(section(a,'other').querySelectorAll('[data-expense-id]').length,3);
 assert.equal(section(a,'home').querySelector('[data-section-total]').textContent.replace(/\u00a0/g,' '),'1 000,25 ₽');
 assert.equal(section(a,'credit').querySelector('[data-section-total]').textContent.replace(/\u00a0/g,' '),'2 000,5 ₽');
 assert.equal(money(a,'availableAmount'),'6 249,25 ₽');
 a.$('overviewNextMonth').click();
 assert.equal(a.w.document.querySelectorAll('[data-expense-section]').length,3);
 assert.equal(a.w.document.querySelectorAll('[data-add-section]').length,3);
 assert.equal(a.w.document.querySelectorAll('[data-expense-id]').length,0);
});
test('each section adds independently, and moving an expense preserves category, payments and budget after reload', async t => {
 const month=new Date().toISOString().slice(0,7);
 const a=await app(t,JSON.stringify({settings:{defaultBudget:10000},expenses:[
  {id:'legacy',title:'Старый план',categoryId:'food',amount:100,date:month+'-01',payments:[{id:'p',amount:20,date:month+'-01'}]}]}));
 for(const id of ['home','credit','other']) {
  a.click(`[data-add-section="${id}"]`);
  assert.equal(a.w.document.querySelector('input[name="expenseSection"]:checked').value,id);
  a.$('expenseTitle').value='Новая '+id;a.$('expenseAmount').value='250.25';
  a.$('categoryPicker').value='food';a.$('categoryPicker').dispatchEvent(new a.w.Event('change'));
  a.submit('expenseForm');assert.match(section(a,id).textContent,new RegExp('Новая '+id));
 }
 a.click('[data-expense-id="legacy"]');a.click('input[name="expenseSection"][value="home"]');a.submit('expenseForm');
 assert.match(section(a,'home').textContent,/Старый план/);
 const migrated=a.read().expenses.find(e=>e.id==='legacy');
 assert.equal(migrated.sectionId,'home');assert.equal(migrated.categoryId,'food');assert.equal(migrated.payments[0].amount,20);
 const b=await app(t,JSON.stringify(a.read()));
 assert.equal(b.w.document.querySelectorAll('[data-expense-id]').length,4);
 assert.equal(section(b,'home').querySelectorAll('[data-expense-id]').length,2);
 assert.equal(money(b,'availableAmount'),'9 149,25 ₽');
 b.click('[data-expense-id="legacy"]');b.$('deleteExpenseButton').click();b.click('#toast button');
 assert.match(section(b,'home').textContent,/Старый план/);
});
test('pinch zoom does not trigger keyboard layout, while keyboard resizing still does', async t => {
 const a=await app(t,null,true);
 a.w.visualViewport.scale=2;a.w.visualViewport.height=a.w.innerHeight/2;
 a.w.visualViewport.dispatchEvent(new a.w.Event('resize'));
 assert.equal(a.w.document.documentElement.classList.contains('keyboard-open'),false);
 a.w.visualViewport.scale=1;a.w.visualViewport.dispatchEvent(new a.w.Event('resize'));
 assert.equal(a.w.document.documentElement.classList.contains('keyboard-open'),true);
});
test('keyboard layout clears after zooming and dismissal, and still handles opening while zoomed', async t => {
 const a=await app(t,null,true), viewport=a.w.visualViewport, root=a.w.document.documentElement;
 viewport.scale=1;viewport.height=450;viewport.dispatchEvent(new a.w.Event('resize'));
 assert.equal(root.classList.contains('keyboard-open'),true);
 viewport.scale=2;viewport.height=225;viewport.dispatchEvent(new a.w.Event('resize'));
 viewport.height=a.w.innerHeight/2;viewport.offsetTop=120;viewport.dispatchEvent(new a.w.Event('resize'));
 assert.equal(root.classList.contains('keyboard-open'),false);
 assert.equal(root.style.getPropertyValue('--keyboard-inset'),'0px');
 a.click('[data-open-expense]');a.$('expenseTitle').focus();
 let scrolled=0;a.w.requestAnimationFrame=fn=>fn();a.$('expenseTitle').scrollIntoView=()=>{scrolled++;};
 viewport.height=225;viewport.dispatchEvent(new a.w.Event('resize'));
 assert.equal(root.classList.contains('keyboard-open'),true);
 assert.equal(root.style.getPropertyValue('--keyboard-inset'),`${a.w.innerHeight-450}px`);
 assert.equal(scrolled,0);
});


test('two month periods show expenses separately while the monthly budget stays unchanged', async t => {
  const month=new Date().toISOString().slice(0,7);
  const a=await app(t,JSON.stringify({settings:{defaultBudget:10000},expenses:[
    {id:'early',title:'Первая половина',amount:2000,date:month+'-07',sectionId:'home'},
    {id:'late',title:'Вторая половина',amount:3500,date:month+'-22',sectionId:'credit'}]}));
  const tabs=a.$('expensePeriodTabs');
  assert.equal(tabs.getAttribute('role'),'tablist');
  assert.equal(tabs.querySelectorAll('[role="tab"]').length,2);
  assert.match(tabs.textContent,/7 /); assert.match(tabs.textContent,/22 /);
  assert.equal(money(a,'availableAmount'),'4 500 ₽');
  a.click('[data-period="early"]');
  assert.deepEqual([...a.w.document.querySelectorAll('[data-expense-id]')].map(x=>x.dataset.expenseId),['early']);
  assert.equal(a.w.document.querySelector('[data-period="early"]').getAttribute('aria-selected'),'true');
  a.click('[data-period="late"]');
  assert.deepEqual([...a.w.document.querySelectorAll('[data-expense-id]')].map(x=>x.dataset.expenseId),['late']);
  assert.equal(money(a,'availableAmount'),'4 500 ₽');
  a.$('overviewNextMonth').click();
  assert.match(tabs.textContent,/7 /); assert.match(tabs.textContent,/22 /);
  assert.equal(a.w.document.querySelectorAll('[data-expense-id]').length,0);
});

test('completion checkmark dims just its own expense, can be undone, and survives reload', async t => {
  const month=new Date().toISOString().slice(0,7);
  const a=await app(t,JSON.stringify({settings:{defaultBudget:10000},expenses:[
    {id:'a',title:'Одна',amount:1000,date:month+'-07'},
    {id:'b',title:'Другая',amount:1500,date:month+'-08'}]}));
  a.click('[data-period="early"]');
  const value=money(a,'availableAmount');
  const button=a.w.document.querySelector('[data-toggle-completed="a"]');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  button.click();
  assert.equal(a.read().expenses.find(x=>x.id==='a').completed,true);
  assert.equal(a.w.document.querySelector('[data-expense-id="a"]').closest('.expense-row').classList.contains('is-completed'),true);
  assert.equal(a.w.document.querySelector('[data-expense-id="b"]').closest('.expense-row').classList.contains('is-completed'),false);
  assert.equal(a.w.document.querySelector('[data-toggle-completed="a"]').getAttribute('aria-pressed'),'true');
  assert.equal(money(a,'availableAmount'),value);
  const b=await app(t,JSON.stringify(a.read()));
  b.click('[data-period="early"]');
  assert.equal(b.w.document.querySelector('[data-toggle-completed="a"]').getAttribute('aria-pressed'),'true');
  b.click('[data-toggle-completed="a"]');
  assert.equal(b.read().expenses.find(x=>x.id==='a').completed,false);
  b.click('[data-expense-id="a"]');
  assert.equal(b.$('expenseDialog').open,true,'checkmark does not remove edit access');
});

test('adding an expense in either half defaults to its date and opens the corresponding tab', async t => {
  const month=new Date().toISOString().slice(0,7);
  const a=await app(t);
  a.click('[data-period="early"]');
  a.click('[data-add-section="home"]');
  assert.equal(a.$('expenseDate').value,month+'-07');
  a.$('expenseTitle').value='Ранний платеж';a.$('expenseAmount').value='900';a.submit('expenseForm');
  assert.match(a.$('upcomingList').textContent,/Ранний платеж/);
  a.click('[data-period="late"]');
  a.click('[data-add-section="credit"]');
  assert.equal(a.$('expenseDate').value,month+'-22');
  a.$('expenseTitle').value='Поздний платеж';a.$('expenseAmount').value='800';a.submit('expenseForm');
  assert.match(a.$('upcomingList').textContent,/Поздний платеж/);
  assert.doesNotMatch(a.$('upcomingList').textContent,/Ранний платеж/);
  assert.deepEqual(a.read().expenses.map(x=>x.date).sort(),[month+'-07',month+'-22']);
});

test('failed local persistence reverts a completion toggle without changing the budget', async t => {
  const month=new Date().toISOString().slice(0,7);
  const a=await app(t,JSON.stringify({settings:{defaultBudget:3000},expenses:[
    {id:'r',title:'Аренда',amount:1000,date:month+'-07'}]}));
  a.click('[data-period="early"]');
  const original=a.w.Storage.prototype.setItem;
  a.w.Storage.prototype.setItem=()=>{throw new Error('Storage full');};
  a.click('[data-toggle-completed="r"]');
  assert.equal(a.read().expenses[0].completed,undefined,'stored record remains unchanged');
  assert.equal(a.w.document.querySelector('[data-toggle-completed="r"]').getAttribute('aria-pressed'),'false');
  assert.equal(money(a,'availableAmount'),'2 000 ₽');
  a.w.Storage.prototype.setItem=original;
});

test('legacy paid items are shown as completed without mutating their payment history', async t => {
  const month=new Date().toISOString().slice(0,7);
  const a=await app(t,JSON.stringify({settings:{defaultBudget:5000},expenses:[
    {id:'paid',title:'Уже оплачено',amount:1000,date:month+'-22',status:'paid'}]}));
  a.click('[data-period="late"]');
  assert.equal(a.w.document.querySelector('[data-toggle-completed="paid"]').getAttribute('aria-pressed'),'true');
  assert.equal(a.read(),null,'loading old data must not rewrite storage until a user change');
  a.click('[data-toggle-completed="paid"]');
  assert.equal(a.read().expenses[0].completed,false);
  assert.equal(a.read().expenses[0].payments[0].amount,1000);
});
