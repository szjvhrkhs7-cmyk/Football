const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
async function app(t, saved) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/pulse/', runScripts: 'outside-only', virtualConsole: vc });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.defineProperty(w.navigator, 'onLine', { value: false });
  w.scrollTo = () => {};
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

test('mandatory payments support create, edit, delete and stay separate from the budget', async t => {
  const a = await app(t);
  a.click('.bottom-nav [data-nav="payments"]');
  assert.equal(a.w.document.querySelector('.screen.active').dataset.screen, 'payments');

  a.$('addPaymentButton').click();
  a.$('paymentTitle').value = 'Аренда';
  a.$('paymentAmount').value = '32000';
  a.$('paymentDay').value = '5';
  a.submit('paymentForm');
  assert.equal(a.read().payments.length, 1);
  assert.match(a.$('paymentsTotal').textContent, /32\s000/);
  assert.match(a.$('overviewPaymentsTotal').textContent, /32\s000/);

  a.$('budgetInput').value = '100000';
  a.$('saveBudgetButton').click();
  assert.match(a.$('availableAmount').textContent, /100\s000/);

  a.click('[data-edit-payment]');
  a.$('paymentAmount').value = '30000';
  a.submit('paymentForm');
  assert.equal(a.read().payments[0].amount, 30000);

  a.click('[data-edit-payment]');
  a.$('deletePaymentButton').click();
  assert.equal(a.read().payments.length, 0);
  assert.equal(a.$('paymentsTotal').textContent, '0 ₽');
});

test('home editors and existing expense/category interactions work without layout patches', async t => {
  const a = await app(t);
  assert.equal(a.$('budgetSettingsCard').closest('.screen').dataset.screen, 'overview');
  assert.equal(a.$('categoriesCard').closest('.screen').dataset.screen, 'overview');
  a.$('budgetInput').value = '40000'; a.$('saveBudgetButton').click();
  a.click('[data-open-expense]');
  a.$('expenseTitle').value = 'Продукты'; a.$('expenseAmount').value = '1000'; a.submit('expenseForm');
  assert.equal(a.read().expenses.length, 1);
  assert.match(a.$('availableAmount').textContent, /39\s000/);
  a.$('openCategoriesButton').click(); assert.equal(a.$('categoriesDialog').open, true);
  a.$('closeCategoriesButton').click(); assert.equal(a.$('categoriesDialog').open, false);
  a.click('[data-nav="plans"]'); assert.equal(a.w.document.querySelector('.screen.active').dataset.screen, 'plans');
  assert.match(a.$('plansList').textContent, /Продукты/);
});
test('old backups migrate without losing expenses or requiring credit records', async t => {
  const a = await app(t, JSON.stringify({ meta: { version: 1, updatedAt: '2026-01-01' }, settings: { defaultBudget: 55 }, expenses: [{ id: 'x', title: 'Old expense', amount: 10, date: '2026-01-01' }] }));
  a.$('addLoanButton').click(); fillLoan(a); a.submit('loanForm');
  assert.equal(a.read().expenses[0].title, 'Old expense');
  assert.equal(a.read().settings.defaultBudget, 55);
  assert.equal(a.read().loans.length, 1);
  assert.deepEqual(a.read().payments, []);
});
