/* Calendar and validation rules shared by the UI and regression tests. */
(() => {
  'use strict';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && dateKey(date) === value;
  }
  function normalize(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && item.id && !seen.has(item.id) && seen.add(item.id))
      .filter(item => validDate(item.firstDate) && Number.isFinite(Number(item.payment)) && Number(item.payment) > 0)
      .map(item => ({
        id: item.id,
        title: String(item.title || 'Кредит').slice(0, 60),
        payment: Math.round(Number(item.payment) * 100) / 100,
        firstDate: item.firstDate,
        endDate: validDate(item.endDate) && item.endDate >= item.firstDate ? item.endDate : '',
        closed: item.closed === true,
        paidMonths: [...new Set((Array.isArray(item.paidMonths) ? item.paidMonths : []).filter(value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)))],
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
      }));
  }
  function dueDate(loan, month) {
    if (loan.closed || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < loan.firstDate.slice(0, 7)) return null;
    const [year, number] = month.split('-').map(Number);
    const day = Math.min(Number(loan.firstDate.slice(8)), new Date(year, number, 0).getDate());
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return loan.endDate && date > loan.endDate ? null : date;
  }
  function schedule(loans, month, today) {
    return loans.map(loan => ({ loan, date: dueDate(loan, month), paid: loan.paidMonths.includes(month) }))
      .filter(item => item.date)
      .map(item => ({ ...item, overdue: !item.paid && item.date < today }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.loan.title.localeCompare(b.loan.title, 'ru'));
  }
  const api = { validDate, normalize, dueDate, schedule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PulseLoans = api;
})();
