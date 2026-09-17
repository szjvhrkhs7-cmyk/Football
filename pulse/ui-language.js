(() => {
  'use strict';

  const byId = id => document.getElementById(id);

  function applyMobileInteractionFixes() {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      );
    }

    if (byId('pulseMobileUiFixes')) return;
    const style = document.createElement('style');
    style.id = 'pulseMobileUiFixes';
    style.textContent = `
      html {
        touch-action: manipulation;
        -webkit-text-size-adjust: 100%;
      }
      body,
      button,
      a,
      input,
      select,
      textarea,
      label,
      [role="button"] {
        touch-action: manipulation;
      }
      input,
      select,
      textarea {
        font-size: 16px !important;
      }
      button,
      a,
      input,
      select,
      textarea {
        -webkit-tap-highlight-color: transparent;
      }
      #categorySettingsButton {
        display: none !important;
      }
      .home-editors {
        margin: 16px 0 4px;
      }
      .home-editors-head {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
        margin: 0 3px 8px;
      }
      .home-editors-head h2 {
        margin: 0;
        font-size: 20px;
      }
      .home-editors-head p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        text-align: right;
      }
      .home-editors .settings-card {
        margin-top: 9px;
      }
      .home-editors .settings-card:first-of-type {
        margin-top: 0;
      }
      @media (max-width: 430px) {
        .home-editors-head {
          align-items: flex-start;
          flex-direction: column;
          gap: 2px;
        }
        .home-editors-head p {
          text-align: left;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function moveEditorsToOverview() {
    if (byId('overviewEditors')) return;

    const overview = document.querySelector('.screen[data-screen="overview"]');
    const balanceCard = overview?.querySelector('.balance-card');
    const budgetCard = byId('budgetSettingsCard');
    const categoriesCard = byId('categoriesCard');
    if (!overview || !balanceCard || !budgetCard || !categoriesCard) return;

    const section = document.createElement('section');
    section.id = 'overviewEditors';
    section.className = 'home-editors';
    section.setAttribute('aria-labelledby', 'overviewEditorsTitle');

    const heading = document.createElement('div');
    heading.className = 'home-editors-head';
    heading.innerHTML = `
      <h2 id="overviewEditorsTitle">Редактирование</h2>
      <p>Планируемый бюджет и категории</p>
    `;

    section.append(heading, budgetCard, categoriesCard);
    balanceCard.insertAdjacentElement('afterend', section);
  }

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

  applyMobileInteractionFixes();
  moveEditorsToOverview();
  normalizeStatusCopy();

  document.addEventListener('DOMContentLoaded', () => {
    moveEditorsToOverview();
    normalizeStatusCopy();
    ['budgetStatusTitle', 'budgetStatusText', 'analyticsBudgetPercent', 'toast'].forEach(id => observe(byId(id)));
  }, { once: true });
})();
