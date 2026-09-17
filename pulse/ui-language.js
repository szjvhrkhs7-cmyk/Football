(() => {
  'use strict';

  const byId = id => document.getElementById(id);

  function normalizeStatusCopy() {
    const title = byId('budgetStatusTitle');
    const text = byId('budgetStatusText');
    const analyticsPercent = byId('analyticsBudgetPercent');
    const toast = byId('toast');

    if (title) {
      const titles = {
        'Задай бюджет': 'Задай планируемый бюджет',
        'Планы выше бюджета': 'Расходы выше планируемого бюджета',
        'Бюджет почти распределён': 'Планируемый бюджет почти исчерпан'
      };
      if (titles[title.textContent]) title.textContent = titles[title.textContent];
    }

    if (text) {
      if (text.textContent === 'Так Пульс сможет оценить запас на месяц') {
        text.textContent = 'Так Пульс сможет показать остаток';
      } else if (text.textContent === 'Добавь планы на месяц') {
        text.textContent = 'Добавь траты';
      } else if (text.textContent.startsWith('Свободно ')) {
        text.textContent = `Остаток ${text.textContent.slice('Свободно '.length)}`;
      }
    }

    if (analyticsPercent) {
      if (analyticsPercent.textContent === 'Бюджет не задан') {
        analyticsPercent.textContent = 'Планируемый бюджет не задан';
      } else if (/^\d+% бюджета$/.test(analyticsPercent.textContent)) {
        analyticsPercent.textContent = analyticsPercent.textContent.replace('% бюджета', '% планируемого бюджета');
      }
    }

    if (toast) {
      if (/^Бюджет на .+ сохранён$/.test(toast.textContent)) {
        toast.textContent = 'Планируемый бюджет сохранён';
      } else if (toast.textContent === 'Укажи корректный бюджет') {
        toast.textContent = 'Укажи корректный планируемый бюджет';
      }
    }
  }

  function observe(element) {
    if (!element) return;
    new MutationObserver(normalizeStatusCopy).observe(element, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeStatusCopy();
    ['budgetStatusTitle', 'budgetStatusText', 'analyticsBudgetPercent', 'toast'].forEach(id => observe(byId(id)));
  }, { once: true });
})();
