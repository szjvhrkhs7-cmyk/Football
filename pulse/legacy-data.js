// Compatibility only: retained records are never displayed or included in calculations.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PulseLegacyData = api;
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
  return { normalize };
});
