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
function fillLoan(a, title = 'Ипотека') {
  a.$('loanTitle').value = title;
  a.$('loanBalance').value = '550000';
  a.$('loanPayment').value = '25000.50';
  const month = new Date().toISOString().slice(0, 7);
  a.$('loanFirstDate').value = `${month}-01`;
}
function fillMandatoryPayment(a, title = 'Аренда', amount = '5000', day = '15') {
  a.$('mandatoryPaymentTitle').value = title;
  a.$('mandatoryPaymentAmount').value = amount;
  a.$('mandatoryPaymentDay').value = day;
}
test('credit create, edit, reload and delete work without a payment schedule', async t => {
  const a = await app(t);
  a.click('[data-screen="settings"] [data-nav="loans"]');
  assert.equal(a.w.document.querySelector('.screen.active').dataset.screen, 'loans');
  assert.equal(a.$('loansSchedule'), null);
  assert.equal(a.$('loansPrevMonth'), null);
  assert.equal(a.$('loanClosed'), null);

  a.$('addLoanButton').click(); fillLoan(a); a.submit('loanForm');
  assert.equal(a.$('loanDialog').open, false);
  assert.equal(a.read().loans.length, 1);
  assert.match(a.$('loansTotal').textContent, /550\s000/);
  assert.match(a.$('loansMonthly').textContent, /25\s000,5/);
  assert.match(a.$('loansDirectory').textContent, /Ипотека/);
  assert.match(a.$('loansDirectory').textContent, /550\s000/);

  a.click('[data-edit-loan]');
  a.$('loanTitle').value = 'Ипотека обновлена';
  a.$('loanBalance').value = '500000';
  a.submit('loanForm');
  assert.equal(a.read().loans[0].balance, 500000);

  const b = await app(t, a.w.localStorage.getItem('pulse-finance-v1'));
  assert.match(b.$('loansTotal').textContent, /500\s000/);
  assert.match(b.$('loansDirectory').textContent, /Ипотека обновлена/);
  b.click('#loansDirectory [data-edit-loan]');
  b.$('deleteLoanButton').click();
  assert.equal(b.read().loans.length, 0);
  assert.equal(b.$('loansTotal').textContent, '0 ₽');
});

test('loan validation keeps the form open and loan names are escaped', async t => {
  const a = await app(t);
  a.$('addLoanButton').click(); fillLoan(a, '<img src=x onerror=alert(1)>');
  a.$('loanBalance').value = '-1'; a.submit('loanForm');
  assert.equal(a.$('loanDialog').open, true);
  assert.match(a.$('loanError').textContent, /задолженности/);
  a.$('loanBalance').value = '1';
  a.$('loanPayment').value = '0.01'; a.submit('loanForm');
  assert.equal(a.$('loansDirectory').querySelector('img'), null);
  assert.match(a.$('loansDirectory').textContent, /<img/);
  assert.equal(a.read().loans[0].payment, 0.01);
});

test('total debt and monthly payments are summed across all credits', async t => {
  const a = await app(t);
  a.$('addLoanButton').click(); fillLoan(a, 'Первый'); a.submit('loanForm');
  a.$('addLoanButton').click(); fillLoan(a, 'Второй');
  a.$('loanBalance').value = '125000';
  a.$('loanPayment').value = '7000';
  a.submit('loanForm');
  assert.match(a.$('loansTotal').textContent, /675\s000/);
  assert.match(a.$('loansMonthly').textContent, /32\s000,5/);
  assert.equal(a.$('loansCount').textContent, '2');
});

test('mandatory payments support CRUD, sort by day and stay outside budget math', async t => {
  const a = await app(t);
  a.$('budgetInput').value = '40000';
  a.$('saveBudgetButton').click();

  a.click('[data-open-expense]');
  a.$('expenseTitle').value = 'Продукты';
  a.$('expenseAmount').value = '1000';
  a.submit('expenseForm');
  assert.match(a.$('availableAmount').textContent, /39\s000/);

  a.$('addMandatoryPaymentButton').click();
  fillMandatoryPayment(a, 'Интернет', '5000', '25');
  a.submit('mandatoryPaymentForm');

  a.$('addMandatoryPaymentButton').click();
  fillMandatoryPayment(a, 'Аренда', '20000', '5');
  a.submit('mandatoryPaymentForm');

  assert.match(a.$('mandatoryPaymentsTotal').textContent, /25\s000/);
  assert.equal(a.w.document.querySelector('[data-screen="overview"] > .linkrow[data-nav="payments"]').querySelectorAll('svg').length, 1);
  assert.equal(a.read().mandatoryPayments.length, 2);
  assert.match(a.$('availableAmount').textContent, /39\s000/);
  assert.deepEqual(
    Array.from(a.w.document.querySelectorAll('#mandatoryPaymentsList .payment-copy strong'), node => node.textContent),
    ['Аренда', 'Интернет']
  );

  const internet = Array.from(a.w.document.querySelectorAll('[data-edit-mandatory-payment]')).find(button => button.textContent.includes('Интернет'));
  internet.click();
  a.$('mandatoryPaymentAmount').value = '6000';
  a.submit('mandatoryPaymentForm');
  assert.match(a.$('mandatoryPaymentsTotal').textContent, /26\s000/);

  const b = await app(t, a.w.localStorage.getItem('pulse-finance-v1'));
  assert.equal(b.read().mandatoryPayments.length, 2);
  assert.match(b.$('mandatoryPaymentsTotal').textContent, /26\s000/);
  assert.match(b.$('availableAmount').textContent, /39\s000/);

  const rent = Array.from(b.w.document.querySelectorAll('[data-edit-mandatory-payment]')).find(button => button.textContent.includes('Аренда'));
  rent.click();
  b.$('deleteMandatoryPaymentButton').click();
  assert.equal(b.read().mandatoryPayments.length, 1);
  assert.match(b.$('mandatoryPaymentsTotal').textContent, /6\s000/);
});

test('mandatory payment validation keeps unsafe titles as text', async t => {
  const a = await app(t);
  a.$('addMandatoryPaymentButton').click();
  fillMandatoryPayment(a, '<img src=x onerror=alert(1)>', '-1', '32');
  a.submit('mandatoryPaymentForm');
  assert.equal(a.$('mandatoryPaymentDialog').open, true);
  assert.match(a.$('mandatoryPaymentError').textContent, /сумму платежа/);

  a.$('mandatoryPaymentAmount').value = '1';
  a.submit('mandatoryPaymentForm');
  assert.match(a.$('mandatoryPaymentError').textContent, /день месяца/);

  a.$('mandatoryPaymentDay').value = '12';
  a.submit('mandatoryPaymentForm');
  assert.equal(a.$('mandatoryPaymentsList').querySelector('img'), null);
  assert.match(a.$('mandatoryPaymentsList').textContent, /<img/);
});

test('profile settings and budget dialog keep expense/category interactions working', async t => {
  const a = await app(t);
  assert.equal(a.$('budgetSettingsCard').closest('.screen').dataset.screen, 'settings');
  assert.equal(a.$('categoriesCard').closest('.screen').dataset.screen, 'settings');
  a.$('budgetInput').value = '40000'; a.$('saveBudgetButton').click();
  a.click('[data-open-expense]');
  a.$('expenseTitle').value = 'Продукты'; a.$('expenseAmount').value = '1000'; a.submit('expenseForm');
  assert.equal(a.read().expenses.length, 1);
  assert.match(a.$('availableAmount').textContent, /39\s000/);
  a.$('categoriesCard').click(); assert.equal(a.$('categoriesDialog').open, true);
  a.$('closeCategoriesButton').click(); assert.equal(a.$('categoriesDialog').open, false);
  a.click('[data-nav="plans"]'); assert.equal(a.w.document.querySelector('.screen.active').dataset.screen, 'plans');
  assert.match(a.$('plansList').textContent, /Продукты/);
});
test('home completion check hides an expense from overview and keeps it in analytics', async t => {
  const a = await app(t);
  a.$('budgetInput').value = '40000';
  a.$('saveBudgetButton').click();

  a.click('[data-open-expense]');
  a.$('expenseTitle').value = 'Продукты';
  a.$('expenseAmount').value = '1250';
  a.submit('expenseForm');

  assert.match(a.$('upcomingList').textContent, /Продукты/);
  const complete = a.w.document.querySelector('#upcomingList [data-complete-expense]');
  assert.ok(complete);
  complete.click();

  assert.equal(a.read().expenses[0].status, 'paid');
  assert.doesNotMatch(a.$('upcomingList').textContent, /Продукты/);
  a.click('[data-filter="paid"]');
  assert.match(a.$('plansList').textContent, /Продукты/);
  a.click('[data-analytics-filter="paid"]');
  assert.match(a.$('analyticsPlanned').textContent, /1\s250/);
  assert.equal(a.$('analyticsCount').textContent, '1 трата');
  assert.match(a.$('availableAmount').textContent, /40\s000/);
});

test('old backups migrate without losing expenses or requiring credit records', async t => {
  const a = await app(t, JSON.stringify({ meta: { version: 1, updatedAt: '2026-01-01' }, settings: { defaultBudget: 55 }, expenses: [{ id: 'x', title: 'Old expense', amount: 10, date: '2026-01-01' }] }));
  a.$('addLoanButton').click(); fillLoan(a); a.submit('loanForm');
  assert.equal(a.read().expenses[0].title, 'Old expense');
  assert.equal(a.read().settings.defaultBudget, 55);
  assert.equal(a.read().loans.length, 1);
  assert.deepEqual(a.read().mandatoryPayments, []);
});

test('profile is in the header and the add action is between overview and analytics', async t => {
  const a = await app(t);
  const nav = a.w.document.querySelector('.bottom-nav');
  assert.deepEqual(Array.from(nav.querySelectorAll('[data-nav]'), e => e.dataset.nav), ['overview', 'analytics']);
  assert.equal(nav.children.length, 3);
  assert.equal(nav.children[1].classList.contains('addwrap'), true);
  assert.ok(a.w.document.querySelector('.topbar #profileButton #profileInitial'));
  assert.ok(a.w.document.querySelector('.topbar #profileButton #syncDot'));
  a.$('profileButton').click();
  assert.equal(a.w.document.querySelector('.screen.active').dataset.screen, 'settings');
  assert.equal(a.$('profileButton').getAttribute('aria-current'), 'page');
  a.$('budgetSettingsCard').click();
  a.$('budgetInput').value = '85000'; a.submit('budgetForm');
  assert.equal(a.read().settings.budgets[new Date().toISOString().slice(0,7)], 85000);
  a.click('.bottom-nav [data-nav="overview"]');
  assert.equal(a.$('profileButton').hasAttribute('aria-current'), false);
  a.$('addExpenseButton').click();
  assert.equal(a.$('expenseDialog').open, true);
});

test('payment can be toggled, undone and deleted while only unpaid expenses reduce the balance', async t => {
  const a = await app(t);
  a.$('budgetInput').value = '40000';a.$('saveBudgetButton').click();
  a.click('[data-open-expense]');a.$('expenseTitle').value = 'Массаж';a.$('expenseAmount').value = '1250.50';a.submit('expenseForm');
  const available = a.$('availableAmount').textContent;
  assert.equal(available.replace(/\u00a0/g,' '),'38 749,5 ₽');
  a.click('#upcomingList [data-complete-expense]');
  assert.equal(a.read().expenses[0].status, 'paid');
  assert.equal(a.$('availableAmount').textContent.replace(/\u00a0/g,' '),'40 000 ₽');
  a.click('#toast button');assert.equal(a.read().expenses[0].status, 'planned');
  assert.equal(a.$('availableAmount').textContent, available);
  a.click('#upcomingList [data-complete-expense]');a.click('[data-filter="paid"]');a.click('#plansList [data-complete-expense]');
  assert.equal(a.read().expenses[0].status, 'planned');assert.equal(a.$('availableAmount').textContent, available);
  a.click('#upcomingList [data-expense-id]');a.$('deleteExpenseButton').click();
  assert.equal(a.read().expenses.length, 0);a.click('#toast button');
  assert.equal(a.read().expenses.length, 1);assert.equal(a.read().expenses[0].amount, 1250.5);assert.equal(a.$('availableAmount').textContent, available);
});

test('filters total only matching expenses and analytics excludes unpaid items on request', async t => {
  const a = await app(t);
  for (const [title,amount,paid] of [['План',1000,false],['Факт',500,true]]) {
    a.click('[data-open-expense]');a.$('expenseTitle').value=title;a.$('expenseAmount').value=amount;a.$('expensePaid').checked=paid;a.submit('expenseForm');
  }
  assert.equal(a.$('plansTotal').textContent.replace(/\u00a0/g,' '),'1 000 ₽');
  a.click('[data-filter="paid"]');assert.equal(a.$('plansTotal').textContent.replace(/\u00a0/g,' '),'500 ₽');
  a.click('[data-filter="all"]');assert.equal(a.$('plansTotal').textContent.replace(/\u00a0/g,' '),'1 500 ₽');
  assert.equal(a.$('analyticsPlanned').textContent.replace(/\u00a0/g,' '),'1 500 ₽');
  a.click('[data-analytics-filter="paid"]');assert.equal(a.$('analyticsPlanned').textContent.replace(/\u00a0/g,' '),'500 ₽');assert.equal(a.$('analyticsCount').textContent,'1 трата');
  a.click('[data-filter="paid"]');a.click('[data-screen="overview"] [data-nav="plans"]');
  assert.equal(a.$('plansTotal').textContent.replace(/\u00a0/g,' '),'1 000 ₽');
  assert.equal(a.w.document.querySelector('[data-filter="planned"]').getAttribute('aria-pressed'),'true');
  assert.ok(Array.from(a.$('weekChart').querySelectorAll('.weekbar')).some(bar=>bar.style.height==='0px'));
});

test('a regular payment is added once per month and its marker survives reload', async t => {
  const a = await app(t);
  a.$('budgetInput').value='40000';a.$('saveBudgetButton').click();
  a.$('addMandatoryPaymentButton').click();fillMandatoryPayment(a,'Интернет','700','31');a.submit('mandatoryPaymentForm');
  assert.equal(a.$('availableAmount').textContent.replace(/\u00a0/g,' '),'40 000 ₽');
  a.click('[data-plan-payment]');a.click('[data-plan-payment]');
  assert.equal(a.read().expenses.length,1);assert.equal(a.$('availableAmount').textContent.replace(/\u00a0/g,' '),'39 300 ₽');
  const b=await app(t,a.w.localStorage.getItem('pulse-finance-v1'));
  b.click('[data-plan-payment]');assert.equal(b.read().expenses.length,1);
  b.$('overviewNextMonth').click();b.click('[data-plan-payment]');assert.equal(b.read().expenses.length,2);
});

test('unspecified debt remains null, while an explicitly entered zero remains zero', async t => {
  const a = await app(t);
  a.$('addLoanButton').click();fillLoan(a,'Не заполнен');a.$('loanBalance').value='';a.submit('loanForm');
  assert.equal(a.read().loans[0].balance,null);assert.equal(a.$('loansTotal').textContent,'Не указан');
  const b=await app(t,a.w.localStorage.getItem('pulse-finance-v1'));
  assert.equal(b.$('loansTotal').textContent,'Не указан');b.click('[data-edit-loan]');b.$('loanBalance').value='0';b.submit('loanForm');
  assert.equal(b.read().loans[0].balance,0);assert.equal(b.$('loansTotal').textContent,'0 ₽');
});

test('editing an expense retains its hidden category and the dropdown accepts a new choice', async t => {
  const month=new Date().toISOString().slice(0,7);
  const a=await app(t,JSON.stringify({settings:{categories:[{id:'hidden',name:'Архив',enabled:false},{id:'active',name:'Активная',enabled:true}]},expenses:[{id:'x',title:'Старая',categoryId:'hidden',date:month+'-02',amount:20,status:'planned'}]}));
  a.click('#upcomingList [data-expense-id]');assert.equal(a.$('categoryPicker').value,'hidden');a.submit('expenseForm');assert.equal(a.read().expenses[0].categoryId,'hidden');
  a.click('#upcomingList [data-expense-id]');a.$('categoryPicker').value='active';a.$('categoryPicker').dispatchEvent(new a.w.Event('change'));a.submit('expenseForm');assert.equal(a.read().expenses[0].categoryId,'active');
});


test('failed local expense saves keep the form open and do not leave unsaved records in memory', async t => {
  const a = await app(t);
  a.click('[data-open-expense]');a.$('expenseTitle').value='Сохраненная';a.$('expenseAmount').value='100';a.submit('expenseForm');
  const saved=a.w.localStorage.getItem('pulse-finance-v1');
  const storagePrototype=Object.getPrototypeOf(a.w.localStorage),original=storagePrototype.setItem;
  storagePrototype.setItem=function(){throw new Error('Quota exceeded')};
  a.click('#upcomingList [data-expense-id]');a.$('expenseTitle').value='Несохраненная';a.$('expenseAmount').value='200';a.submit('expenseForm');
  assert.equal(a.$('expenseDialog').open,true);assert.equal(a.w.localStorage.getItem('pulse-finance-v1'),saved);
  storagePrototype.setItem=original;a.$('expenseDialog').close();a.$('overviewNextMonth').click();a.$('overviewPrevMonth').click();
  assert.match(a.$('upcomingList').textContent,/Сохраненная/);assert.doesNotMatch(a.$('upcomingList').textContent,/Несохраненная/);
  a.click('[data-open-expense]');a.$('expenseTitle').value='Новая';a.$('expenseAmount').value='50';
  storagePrototype.setItem=function(){throw new Error('Quota exceeded')};a.submit('expenseForm');assert.equal(a.$('expenseDialog').open,true);
  storagePrototype.setItem=original;a.submit('expenseForm');assert.equal(a.read().expenses.length,2);
});


test('mobile sheets open without focusing a field and follow keyboard resize and pan', async t => {
  const a = await app(t, undefined, true),viewport=a.w.visualViewport,root=a.w.document.documentElement;
  a.click('[data-open-expense]');
  assert.equal(a.w.document.activeElement.id,'expenseDialogTitle');
  viewport.height=390;viewport.dispatchEvent(new a.w.Event('resize'));
  assert.equal(root.style.getPropertyValue('--visible-height'),'390px');
  assert.equal(root.style.getPropertyValue('--keyboard-inset'),`${a.w.innerHeight-390}px`);
  assert.ok(root.classList.contains('keyboard-open'));
  viewport.offsetTop=60;viewport.dispatchEvent(new a.w.Event('scroll'));
  assert.equal(root.style.getPropertyValue('--keyboard-inset'),`${a.w.innerHeight-450}px`);
  viewport.height=a.w.innerHeight;viewport.offsetTop=0;viewport.dispatchEvent(new a.w.Event('resize'));
  assert.equal(root.style.getPropertyValue('--keyboard-inset'),'0px');
  assert.equal(root.classList.contains('keyboard-open'),false);
});


test('budget preview follows input without saving or changing planned expenses', async t => {
  const a = await app(t);
  a.click('[data-open-expense]');a.$('expenseTitle').value='В плане';a.$('expenseAmount').value='3000';a.submit('expenseForm');
  a.$('openBudgetButton').click();const before=a.w.localStorage.getItem('pulse-finance-v1');
  a.$('budgetInput').value='2000';a.$('budgetInput').dispatchEvent(new a.w.Event('input'));
  assert.equal(a.$('budgetPlannedAmount').textContent.replace(/\u00a0/g,' '),'3 000 ₽');
  assert.match(a.$('budgetRemainingAmount').textContent,/-1/);assert.ok(a.$('budgetRemainingAmount').classList.contains('negative'));
  assert.equal(a.w.localStorage.getItem('pulse-finance-v1'),before);
  a.$('budgetInput').value='';a.$('budgetInput').dispatchEvent(new a.w.Event('input'));assert.equal(a.$('budgetRemainingAmount').textContent,'—');
});

test('overview subtracts only unpaid expenses for the selected month and updates after payment', async t => {
  const today = new Date(), month = today.toISOString().slice(0, 7);
  const otherMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1)).toISOString().slice(0, 7);
  const planned = Array.from({ length: 8 }, (_, i) => ({
    id: `planned-${i + 1}`, title: `Трата ${i + 1}`, categoryId: 'other',
    amount: 100 * (i + 1), date: `${month}-${String(i + 1).padStart(2, '0')}`, status: 'planned'
  }));
  const a = await app(t, JSON.stringify({ settings: { defaultBudget: 85000 }, expenses: [
    ...planned,
    { id: 'paid', title: 'Уже оплаченная', categoryId: 'other', amount: 500, date: `${month}-01`, status: 'paid' },
    { id: 'other-month', title: 'Другой месяц', categoryId: 'other', amount: 999, date: `${otherMonth}-01`, status: 'planned' }
  ] }));
  const visibleIds = () => Array.from(a.$('upcomingList').querySelectorAll('[data-expense-id]'), button => button.dataset.expenseId);
  assert.deepEqual(visibleIds(), planned.map(expense => expense.id));
  assert.equal(a.$('overviewPlansLink').textContent, 'Все 8');
  const balance = a.$('availableAmount').textContent;
  assert.equal(balance.replace(/\u00a0/g,' '),'81 400 ₽');
  a.click('#upcomingList [data-complete-expense="planned-8"]');
  assert.deepEqual(visibleIds(), planned.slice(0, -1).map(expense => expense.id));
  assert.equal(a.$('overviewPlansLink').textContent, 'Все 7');
  assert.equal(a.$('availableAmount').textContent.replace(/\u00a0/g,' '),'82 200 ₽');
  assert.equal(a.read().expenses.find(expense => expense.id === 'planned-8').status, 'paid');
});

test('month builder selects regular payments, edits a single occurrence and blocks duplicates after reload', async t => {
  const a = await app(t);
  for (const [name,amount,day] of [['Интернет','1000','19'],['Квартира','5000','31']]) {
    a.$('addMandatoryPaymentButton').click();fillMandatoryPayment(a,name,amount,day);a.submit('mandatoryPaymentForm');
  }
  a.$('openMonthBuilder').click();
  assert.equal(a.$('monthBuilderDialog').open,true);
  a.$('builderMonth').value='2027-02';a.$('builderMonth').dispatchEvent(new a.w.Event('change'));
  const rows=a.$('builderRows').querySelectorAll('[data-builder-id]');
  assert.equal(rows.length,2);
  const rent=Array.from(rows).find(row=>row.textContent.includes('Квартира'));
  assert.equal(rent.querySelector('[data-builder-date]').value,'2027-02-28');
  rent.querySelector('[data-builder-amount]').value='4800';
  rent.querySelector('[data-builder-amount]').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  assert.match(a.$('builderTotal').textContent,/5\s800/);
  a.submit('monthBuilderForm');
  assert.equal(a.read().expenses.length,2);
  assert.equal(a.read().expenses.find(e=>e.title==='Квартира').amount,4800);
  assert.equal(a.read().mandatoryPayments.find(e=>e.title==='Квартира').amount,5000);
  assert.equal(a.$('monthBuilderDialog').open,false);
  const b=await app(t,a.w.localStorage.getItem('pulse-finance-v1'));
  b.$('openMonthBuilder').click();b.$('builderMonth').value='2027-02';b.$('builderMonth').dispatchEvent(new b.w.Event('change'));
  assert.equal(b.$('builderSubmit').disabled,true);
  assert.equal(b.$('builderRows').querySelectorAll('input[type="checkbox"]:disabled').length,2);
  b.submit('monthBuilderForm');assert.equal(b.read().expenses.length,2);
});

test('month builder excludes unchecked payments and rejects dates outside selected month',async t=>{
  const a=await app(t);
  for(const name of ['Один','Два']){a.$('addMandatoryPaymentButton').click();fillMandatoryPayment(a,name,'100','15');a.submit('mandatoryPaymentForm');}
  a.$('openMonthBuilder').click();a.$('builderMonth').value='2027-03';a.$('builderMonth').dispatchEvent(new a.w.Event('change'));
  const rows=a.$('builderRows').querySelectorAll('[data-builder-id]');
  rows[1].querySelector('[data-builder-selected]').checked=false;
  const date=rows[0].querySelector('[data-builder-date]');date.value='2027-04-01';
  a.submit('monthBuilderForm');assert.equal(a.read().expenses.length,0);assert.match(a.$('builderError').textContent,/месяц/);
  date.value='2027-03-18';a.submit('monthBuilderForm');
  assert.equal(a.read().expenses.length,1);assert.equal(a.read().expenses[0].date,'2027-03-18');
});

test('month builder keeps the draft open when saving fails and creates no partial batch',async t=>{
  const a=await app(t);a.$('addMandatoryPaymentButton').click();fillMandatoryPayment(a);a.submit('mandatoryPaymentForm');a.$('openMonthBuilder').click();
  const originalSetItem=a.w.Storage.prototype.setItem;
  a.w.Storage.prototype.setItem=function(){throw new Error('QuotaExceededError');};
  a.submit('monthBuilderForm');assert.equal(a.$('monthBuilderDialog').open,true);assert.match(a.$('builderError').textContent,/сохранить/);
  a.w.Storage.prototype.setItem=originalSetItem;
  a.submit('monthBuilderForm');
  assert.equal(a.read().expenses.length,1);
  assert.equal(a.$('monthBuilderDialog').open,false);
});

test('overview removes crossed-out totals and calendar filters without changing the budget',async t=>{
  const a=await app(t);
  assert.equal(a.$('budgetMeter'),null);assert.equal(a.$('plannedAmount'),null);
  a.$('budgetInput').value='56000';a.$('saveBudgetButton').click();
  a.click('[data-open-expense]');a.$('expenseTitle').value='Интернет';a.$('expenseAmount').value='1000';a.submit('expenseForm');
  const before=a.$('availableAmount').textContent;
  const today=a.w.document.querySelector(`[data-overview-day="${a.read().expenses[0].date}"]`);
  assert.ok(today);today.click();assert.match(a.$('upcomingList').textContent,/Интернет/);assert.equal(a.$('availableAmount').textContent,before);
});

test('moving to a different expense month clears the calendar day filter',async t=>{
 const a=await app(t);
 const day=a.w.document.querySelector('[data-overview-day]:not([disabled])');day.click();
 a.click('[data-open-expense]');a.$('expenseTitle').value='Новый месяц';a.$('expenseAmount').value='250';a.$('expenseDate').value='2027-08-12';a.submit('expenseForm');
 assert.match(a.$('upcomingList').textContent,/Новый месяц/);assert.equal(a.$('upcomingHeading').textContent,'К оплате');
});

test('moving a recurring occurrence into an occupied month is rejected',async t=>{
 const month=new Date().toISOString().slice(0,7);
 const saved=JSON.stringify({mandatoryPayments:[{id:'template',title:'Интернет',amount:1000,day:15}],expenses:[{id:'one',mandatoryPaymentId:'template',title:'Интернет',amount:1000,date:month+'-15',status:'planned',categoryId:'food'},{id:'two',mandatoryPaymentId:'template',title:'Интернет',amount:1000,date:'2027-08-15',status:'planned',categoryId:'food'}]});
 const a=await app(t,saved);a.click('#upcomingList [data-expense-id="one"]');a.$('expenseDate').value='2027-08-20';a.submit('expenseForm');
 assert.equal(a.$('expenseDialog').open,true);assert.match(a.$('expenseError').textContent,/уже/);
 assert.equal(a.read().expenses.filter(e=>e.date.startsWith('2027-08')).length,1);
});

test('a closing sheet stays open for its short animation and closes on completion',async t=>{
 const a=await app(t);a.click('[data-open-expense]');const dialog=a.$('expenseDialog');let complete;
 dialog.animate=()=>({finished:new Promise(resolve=>complete=resolve),cancel(){}});
 a.click('[data-close-dialog]');assert.equal(dialog.open,true);complete();await Promise.resolve();assert.equal(dialog.open,false);
});

test('reopening a closing sheet cancels its obsolete close callback',async t=>{
 const a=await app(t);a.click('[data-open-expense]');const dialog=a.$('expenseDialog');let complete;let cancelled=0;
 dialog.animate=()=>({finished:new Promise(resolve=>complete=resolve),cancel(){cancelled++;}});
 a.click('[data-close-dialog]');a.click('[data-open-expense]');complete();await Promise.resolve();assert.equal(dialog.open,true);assert.equal(cancelled,1);
});

test('reduced motion closes sheets immediately',async t=>{
 const a=await app(t);a.w.matchMedia=()=>({matches:true});a.click('[data-open-expense]');a.$('expenseDialog').animate=()=>{throw Error('Animation should be skipped');};a.click('[data-close-dialog]');assert.equal(a.$('expenseDialog').open,false);
});

test('a rapid second save while the expense sheet is closing creates no duplicate',async t=>{
 const a=await app(t);a.click('[data-open-expense]');let complete;
 a.$('expenseDialog').animate=()=>({finished:new Promise(resolve=>complete=resolve),cancel(){}});
 a.$('expenseTitle').value='Разовая покупка';a.$('expenseAmount').value='300';a.submit('expenseForm');a.submit('expenseForm');
 assert.equal(a.read().expenses.length,1);complete();await Promise.resolve();
});


test('budget preview and overview exclude paid expenses, without changing saved records', async t => {
  const month = new Date().toISOString().slice(0, 7);
  const a = await app(t, JSON.stringify({
    settings: { defaultBudget: 58000, budgets: { [month]: 58000 } },
    expenses: [
      { id: 'unpaid', title: 'Предстоящая', categoryId: 'food', amount: 18000, date: month + '-10', status: 'planned' },
      { id: 'settled', title: 'Оплаченная', categoryId: 'food', amount: 31133, date: month + '-11', status: 'paid' }
    ]
  }));
  assert.equal(a.$('budgetAmount').textContent.replace(/\u00a0/g,' '), '58 000 ₽');
  assert.equal(a.$('availableAmount').textContent.replace(/\u00a0/g,' '), '40 000 ₽');
  a.$('openBudgetButton').click();
  assert.equal(a.$('budgetPlannedAmount').textContent.replace(/\u00a0/g,' '), '18 000 ₽');
  assert.equal(a.$('budgetRemainingAmount').textContent.replace(/\u00a0/g,' '), '40 000 ₽');
  a.$('closeBudgetButton').click();
  a.click('#upcomingList [data-complete-expense="unpaid"]');
  assert.equal(a.$('availableAmount').textContent.replace(/\u00a0/g,' '), '58 000 ₽');
  a.$('openBudgetButton').click();
  a.$('budgetInput').value='60000';
  a.$('budgetInput').dispatchEvent(new a.w.Event('input'));
  assert.equal(a.$('budgetRemainingAmount').textContent.replace(/\u00a0/g,' '), '60 000 ₽');
  assert.equal(a.read().expenses.length, 2);
  assert.equal(a.read().expenses[1].status, 'paid');
});

test('overview removes decorative controls but retains budget, recurring payment and tab navigation',async t=>{
  const a=await app(t);
  const budget=a.$('openBudgetButton');
  assert.equal(budget.querySelector('svg'),null);
  assert.equal(budget.getAttribute('aria-label'),'Изменить планируемый бюджет');
  budget.click();
  assert.equal(a.$('budgetDialog').open,true);
  a.$('closeBudgetButton').click();
  const recurring=a.w.document.querySelector('[data-screen="overview"] > .linkrow[data-nav="payments"]');
  assert.ok(recurring);
  assert.equal(recurring.querySelectorAll('svg').length,1);
  assert.equal(recurring.querySelector('strong'),null);
  assert.match(recurring.textContent,/Регулярные платежи/);
  recurring.click();
  assert.equal(a.w.document.querySelector('.screen.active').dataset.screen,'payments');
  a.click('.bottom-nav [data-nav="analytics"]');
  assert.equal(a.w.document.querySelector('.screen.active').dataset.screen,'analytics');
  assert.equal(a.w.document.querySelector('.bottom-nav [data-nav="analytics"]').classList.contains('active'),true);
  const css=fs.readFileSync(path.join(root,'light.css'),'utf8');
  assert.match(css,/\.dock \.nav button\.active::before,\.dock \.nav button\.active::after\{content:none;display:none\}/);
});

test('retired spending is absent from every screen and excluded from budget and analytics after reload', async t => {
  const month = new Date().toISOString().slice(0, 7);
  const legacy = [{id:'old', amount:7000, date:month+'-01', categoryId:'food', comment:'Старая запись'}];
  const saved = JSON.stringify({settings:{defaultBudget:20000}, expenses:[
    {id:'plan', title:'Аренда', amount:5000, date:month+'-01', categoryId:'home'}
  ], unplannedExpenses:legacy});
  const a = await app(t, saved);
  assert.doesNotMatch(a.w.document.body.textContent, /незапланирован|вне плана/i);
  assert.equal(a.w.document.querySelector('[data-screen="unplanned"]'), null);
  assert.equal(a.$('unplannedDialog'), null);
  assert.match(a.$('availableAmount').textContent, /15\s000/);
  assert.match(a.$('analyticsPlanned').textContent, /5\s000/);
  a.$('openBudgetButton').click();
  assert.match(a.$('budgetRemainingAmount').textContent, /15\s000/);
  a.$('budgetInput').value = '21000'; a.submit('budgetForm');
  assert.equal(a.read().unplannedExpenses[0].id, 'old');
  const b = await app(t, a.w.localStorage.getItem('pulse-finance-v1'));
  assert.match(b.$('availableAmount').textContent, /16\s000/);
  assert.match(b.$('analyticsPlanned').textContent, /5\s000/);
  assert.equal(b.read().expenses[0].id, 'plan');
  assert.equal(b.read().unplannedExpenses[0].amount, 7000);
});

test('month controls show MM.YY and move one month across year boundaries', async t => {
  const a = await app(t);
  const current = new Date();
  const shift = (2026 - current.getFullYear()) * 12 + 11 - current.getMonth();
  for (let i = 0; i < Math.abs(shift); i++) a.$(shift < 0 ? 'overviewPrevMonth' : 'overviewNextMonth').click();
  const labels = ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'];
  labels.forEach(id => assert.equal(a.$(id).textContent, '12.26'));
  a.$('overviewNextMonth').click();
  labels.forEach(id => assert.equal(a.$(id).textContent, '01.27'));
  assert.match(a.$('overviewTitle').textContent, /январь/);
  assert.match(a.$('overviewMonthLabel').getAttribute('aria-label'), /2027/);
  a.$('overviewPrevMonth').click();
  labels.forEach(id => assert.equal(a.$(id).textContent, '12.26'));
  a.$('overviewMonthLabel').click();
  const expected = `${String(current.getMonth() + 1).padStart(2, '0')}.${String(current.getFullYear()).slice(-2)}`;
  labels.forEach(id => assert.equal(a.$(id).textContent, expected));
});

test('a planned category can be created on overview and its emoji selected from presets', async t => {
  const a=await app(t);
  a.$('overviewCreateCategory').click();
  assert.equal(a.$('categoryDialog').open,true);
  a.$('categoryName').value='Путешествия';
  a.click('[data-category-emoji="✈️"]');
  assert.equal(a.$('categoryEmoji').value,'✈️');
  a.submit('categoryForm');
  const saved=a.read().settings.categories.find(x=>x.name==='Путешествия');
  assert.ok(saved);
  assert.equal(saved.emoji,'✈️');
  assert.equal(saved.enabled,true);
  a.click('[data-open-expense]');
  assert.equal(a.$('categoryPicker').value,saved.id);
  assert.ok([...a.$('categoryPicker').options].some(x=>x.value===saved.id));
  a.$('plannedCreateCategory').click();
  assert.equal(a.$('categoryDialog').open,true);
  a.$('categoryName').value='Семья';
  a.$('categoryEmoji').value='👨‍👩‍👧';
  a.submit('categoryForm');
  assert.equal(a.$('categoryPicker').value,a.read().settings.categories.at(-1).id);
  assert.equal(a.read().settings.categories.at(-1).emoji,'👨‍👩‍👧');
  assert.equal(a.read().expenses.length,0);
});


test('overview hides paid-month summary while keeping paid expenses and analytics', async t => {
  const a = await app(t);
  assert.equal(a.$('overviewPaidSummary'), null);
  assert.equal(a.w.document.querySelector('[data-screen="overview"]').textContent.includes('Оплачено в этом месяце'), false);

  a.click('[data-open-expense]');
  a.$('expenseTitle').value = 'Оплаченный расход';
  a.$('expenseAmount').value = '1750';
  a.$('expensePaid').checked = true;
  a.submit('expenseForm');
  assert.equal(a.read().expenses.length, 1);
  assert.equal(a.read().expenses[0].status, 'paid');
  assert.equal(a.$('overviewPaidSummary'), null);
  assert.equal(a.w.document.querySelector('[data-screen="overview"]').textContent.includes('Оплачено в этом месяце'), false);
  a.click('[data-analytics-filter="paid"]');
  assert.equal(a.$('analyticsCount').textContent, '1 трата');
  assert.match(a.$('analyticsPlanned').textContent, /1\s750/);
});

// Catches loss of partial amounts, duplicate submits and incorrect residual budget.
test('partial planned payments persist after reload and reject invalid or duplicate submissions', async t => {
  const a = await app(t);
  a.click('[data-open-expense]'); a.$('expenseTitle').value='Аренда'; a.$('expenseAmount').value='10000'; a.submit('expenseForm');
  assert.ok(a.w.document.querySelector('[data-pay-expense]'), 'planned row offers partial payment');
  a.click('[data-pay-expense]'); a.$('plannedPaymentAmount').value='4000'; a.submit('plannedPaymentForm'); a.submit('plannedPaymentForm');
  assert.equal(a.read().expenses[0].payments.filter(p=>!p.voided).length,1);
  assert.match(a.$('upcomingList').textContent,/6\s000/);
  assert.equal(a.read().unplannedExpenses.length,0);
  const b=await app(t,a.w.localStorage.getItem('pulse-finance-v1'));
  assert.match(b.$('upcomingList').textContent,/4\s000/);
  assert.match(b.$('availableAmount').textContent,/114\s000/);
  b.click('[data-pay-expense]');
  for(const amount of ['0','-1','6000.01','NaN']) { b.$('plannedPaymentAmount').value=amount; b.submit('plannedPaymentForm'); assert.equal(b.$('plannedPaymentDialog').open,true); assert.ok(b.$('plannedPaymentError').textContent); }
  b.$('plannedPaymentAll').click(); b.submit('plannedPaymentForm');
  assert.equal(b.read().expenses[0].status,'paid');
  assert.equal(b.$('upcomingList').querySelector('[data-pay-expense]'),null);
  b.click('[data-analytics-filter="paid"]');
  assert.match(b.$('analyticsPlanned').textContent,/10\s000/);
});

// Catches losing history on cancellation or restoring payments without restoring the residual.
test('planned history cancels and restores plans, and voids or restores individual payments',async t=>{
  const a=await app(t);
  a.click('[data-open-expense]');a.$('expenseTitle').value='Аренда';a.$('expenseAmount').value='10000';a.submit('expenseForm');
  assert.ok(a.$('plannedHistoryButton'),'history is reachable from home');
  a.click('[data-pay-expense]');a.$('plannedPaymentAmount').value='4000';a.submit('plannedPaymentForm');
  a.$('plannedHistoryButton').click();a.click('[data-cancel-plan]');
  assert.equal(a.read().expenses[0].cancelled,true); assert.equal(a.$('upcomingList').querySelector('[data-pay-expense]'),null);
  a.click('[data-restore-plan]');assert.equal(a.read().expenses[0].cancelled,false);assert.match(a.$('upcomingList').textContent,/6\s000/);
  a.click('[data-history-payments]'); a.click('[data-void-payment]');
  assert.equal(a.read().expenses[0].payments[0].voided,true);assert.match(a.$('upcomingList').textContent,/10\s000/);
  a.click('[data-restore-payment]'); assert.equal(a.read().expenses[0].payments[0].voided,false);assert.match(a.$('upcomingList').textContent,/6\s000/);
});

test('returning a paid plan keeps cancelled payments in history and legacy paid plans migrate once',async t=>{
 const month=new Date().toISOString().slice(0,7);
 const a=await app(t,JSON.stringify({expenses:[{id:'old-paid',title:'Старая оплата',amount:10000,date:`${month}-01`,status:'paid'}]}));
 a.$('plannedHistoryButton').click();a.click('[data-return-plan]');
 assert.equal(a.read().expenses[0].status,'planned');assert.equal(a.read().expenses[0].payments.length,1);
 assert.equal(a.read().expenses[0].payments[0].voided,true);
 assert.match(a.$('upcomingList').textContent,/10\s000/);
 a.click('[data-history-payments]');a.click('[data-restore-payment]');
 assert.equal(a.read().expenses[0].status,'paid');
 const b=await app(t,a.w.localStorage.getItem('pulse-finance-v1'));
 b.$('plannedHistoryButton').click();b.click('[data-history-payments]');
 assert.equal(b.$('plannedPaymentHistory').querySelectorAll('[data-void-payment]').length,1);
});

test('paid analytics uses the payment date, partial edits preserve payments and budget preview uses the residual',async t=>{
 const a=await app(t);
 a.click('[data-open-expense]');a.$('expenseTitle').value='<img src=x onerror=alert(1)>';a.$('expenseAmount').value='10000';a.submit('expenseForm');
 a.click('[data-pay-expense]');a.$('plannedPaymentAmount').value='4000';a.$('plannedPaymentDate').value='2020-01-01';a.submit('plannedPaymentForm');
 a.click('[data-analytics-filter="paid"]'); assert.equal(a.$('analyticsPlanned').textContent,'0 ₽');
 a.click('#upcomingList [data-expense-id]');a.$('expenseTitle').value='Новое имя';a.submit('expenseForm');
 assert.equal(a.read().expenses[0].payments[0].amount,4000);
 assert.match(a.$('budgetPlannedAmount').textContent,/6\s000/);
 a.$('plannedHistoryButton').click();assert.equal(a.$('plannedHistoryList').querySelector('img'),null);
});
