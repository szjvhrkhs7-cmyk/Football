(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PulseUnplanned = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const dateOk = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  };
  function normalize(items, categories, fallbackDate) {
    const categoryIds = new Set(categories.map(x => x.id));
    const fallback = categories[0]?.id || 'other';
    const unique = new Map();
    if (!Array.isArray(items)) return [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) continue;
      const amount = money(item.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15) continue;
      const record = {
        id: item.id.slice(0, 120), amount,
        categoryId: categoryIds.has(item.categoryId) ? item.categoryId : fallback,
        date: dateOk(item.date) ? item.date : fallbackDate,
        comment: String(item.comment || '').slice(0, 300),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
      };
      if (!dateOk(record.date)) continue;
      const existing = unique.get(record.id);
      if (!existing || Date.parse(record.updatedAt) >= Date.parse(existing.updatedAt)) unique.set(record.id, record);
    }
    return [...unique.values()];
  }
  function periodBounds(kind, anchor, start, end) {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(anchor) ? anchor : new Date().toISOString().slice(0, 7);
    const [year, m] = month.split('-').map(Number);
    if (kind === 'all') return { start: '', end: '' };
    if (kind === 'year') return { start: `${year}-01-01`, end: `${year}-12-31` };
    if (kind === 'quarter') {
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      const last = q + 2;
      return { start: `${year}-${String(q).padStart(2, '0')}-01`, end: `${year}-${String(last).padStart(2, '0')}-${new Date(Date.UTC(year, last, 0)).getUTCDate()}` };
    }
    if (kind === 'custom') return { start: dateOk(start) ? start : '', end: dateOk(end) ? end : '' };
    return { start: month + '-01', end: month + '-' + new Date(Date.UTC(year, m, 0)).getUTCDate() };
  }
  function filter(items, bounds, category = 'all') {
    return items.filter(x => (!bounds.start || x.date >= bounds.start) && (!bounds.end || x.date <= bounds.end)
      && (category === 'all' || x.categoryId === category))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  // The data and monthly totals remain intact; only the visible list is shortened.
  function splitRecent(items, limit = 10) {
    const count = Number.isInteger(limit) && limit >= 0 ? limit : 10;
    return { recent: items.slice(0, count), older: items.slice(count) };
  }
  function summary(items, categories) {
    const sums = new Map(), total = money(items.reduce((s, x) => s + x.amount, 0));
    for (const item of items) sums.set(item.categoryId, money((sums.get(item.categoryId) || 0) + item.amount));
    const categoryMap = new Map(categories.map(c => [c.id, c]));
    const rows = [...sums.entries()].map(([id, amount]) => ({
      id, name: categoryMap.get(id)?.name || 'Другое', amount,
      percent: total ? Math.round(amount / total * 1000) / 10 : 0
    })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ru'));
    return { total, count: items.length, average: items.length ? money(total / items.length) : 0,
      topCategory: rows[0]?.name || '—', categories: rows };
  }
  function timeline(items, granularity = 'week') {
    const totals = new Map();
    for (const item of items) {
      const key = granularity === 'month' ? item.date.slice(0, 7)
        : granularity === 'day' ? item.date
        : (() => {
          const d = new Date(item.date + 'T12:00:00Z');
          const weekday = (d.getUTCDay() + 6) % 7;
          d.setUTCDate(d.getUTCDate() - weekday);
          return d.toISOString().slice(0, 10);
        })();
      totals.set(key, money((totals.get(key) || 0) + item.amount));
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }));
  }
  function validate(input, categoryIds) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15 || Math.round(amount * 100) / 100 !== amount) return 'Укажи положительную сумму с точностью до копеек';
    if (!categoryIds.includes(input.categoryId)) return 'Выбери категорию';
    if (!dateOk(input.date)) return 'Укажи корректную дату';
    if (String(input.comment || '').length > 300) return 'Комментарий не должен превышать 300 символов';
    return '';
  }
  return Object.freeze({ normalize, periodBounds, filter, splitRecent, summary, timeline, validate, dateOk, money });
});
