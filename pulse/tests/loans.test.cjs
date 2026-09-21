const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, normalize, dueDate, schedule } = require('../loans.js');
const loan = { id: 'loan-1', title: 'Ипотека', firstDate: '2026-01-31', endDate: '', payment: 12345.67, balance: 450000, paidMonths: [], closed: false };
test('calendar clamps the 31st without drifting in the following month', () => {
  assert.equal(dueDate(loan, '2026-02'), '2026-02-28');
  assert.equal(dueDate(loan, '2026-03'), '2026-03-31');
  assert.equal(dueDate(loan, '2028-02'), '2028-02-29');
  assert.equal(dueDate(loan, '2027-01'), '2027-01-31');
});
test('start/end boundaries and closed loans are excluded', () => {
  assert.equal(dueDate(loan, '2025-12'), null);
  assert.equal(dueDate({ ...loan, closed: true }, '2026-02'), null);
  assert.equal(dueDate({ ...loan, endDate: '2026-02-27' }, '2026-02'), null);
  assert.equal(dueDate({ ...loan, endDate: '2026-02-28' }, '2026-02'), '2026-02-28');
});
test('invalid dates and malformed records do not enter the schedule', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-13-01'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.deepEqual(normalize([null, {}, { ...loan, payment: Infinity }, { ...loan, firstDate: '2026-02-30' }]), []);
  assert.deepEqual(normalize(undefined), []);
});
test('payment markers are monthly and overdue dates are retained', () => {
  const paid = { ...loan, paidMonths: ['2026-02'] };
  assert.equal(schedule([paid], '2026-02', '2026-03-01')[0].paid, true);
  assert.equal(schedule([paid], '2026-02', '2026-03-01')[0].overdue, false);
  assert.equal(schedule([paid], '2026-03', '2026-04-01')[0].overdue, true);
});
test('backup normalization preserves credit amounts and payment history', () => {
  const copy = normalize(JSON.parse(JSON.stringify([{ ...loan, paidMonths: ['2026-02', '2026-02', '2026-99'] }])));
  assert.equal(copy[0].payment, 12345.67);
  assert.equal(copy[0].balance, 450000);
  assert.deepEqual(copy[0].paidMonths, ['2026-02']);
  assert.equal(normalize([loan, loan]).length, 1);
});
