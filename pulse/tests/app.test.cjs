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
  a.click('.bottom-nav [data-nav="loans"]');
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
  assert.match(a.$('mandatoryOverviewAmount').textContent, /25\s000/);
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
  assert.match(a.$('availableAmount').textContent, /38\s750/);
});

test('old backups migrate without losing expenses or requiring credit records', async t => {
  const a = await app(t, JSON.stringify({ meta: { version: 1, updatedAt: '2026-01-01' }, settings: { defaultBudget: 55 }, expenses: [{ id: 'x', title: 'Old expense', amount: 10, date: '2026-01-01' }] }));
  a.$('addLoanButton').click(); fillLoan(a); a.submit('loanForm');
  assert.equal(a.read().expenses[0].title, 'Old expense');
  assert.equal(a.read().settings.defaultBudget, 55);
  assert.equal(a.read().loans.length, 1);
  assert.deepEqual(a.read().mandatoryPayments, []);
});

test('four-tab navigation opens real profile settings and the budget editor', async t => {
  const a = await app(t);
  assert.deepEqual(Array.from(a.w.document.querySelectorAll('.bottom-nav [data-nav]'), e => e.dataset.nav), ['overview', 'plans', 'loans', 'analytics']);
  a.$('profileButton').click();
  assert.equal(a.w.document.querySelector('.screen.active').dataset.screen, 'settings');
  a.$('budgetSettingsCard').click();
  assert.equal(a.$('budgetDialog').open, true);
  a.$('budgetInput').value = '85000';a.submit('budgetForm');
  assert.equal(a.$('budgetDialog').open, false);
  assert.equal(a.read().settings.budgets[new Date().toISOString().slice(0,7)], 85000);
});

test('payment can be toggled, undone and deleted with undo without counting twice', async t => {
  const a = await app(t);
  a.$('budgetInput').value = '40000';a.$('saveBudgetButton').click();
  a.click('[data-open-expense]');a.$('expenseTitle').value = 'Массаж';a.$('expenseAmount').value = '1250.50';a.submit('expenseForm');
  const available = a.$('availableAmount').textContent;
  a.click('#upcomingList [data-complete-expense]');
  assert.equal(a.read().expenses[0].status, 'paid');assert.equal(a.$('availableAmount').textContent, available);
  a.click('#toast button');assert.equal(a.read().expenses[0].status, 'planned');
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
  assert.equal(a.w.document.activeElement.className,'sheet-close');
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
