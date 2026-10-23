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
