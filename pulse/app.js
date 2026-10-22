(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbhcfvbdeuntrjbhbdpq.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KEfQWQNIMDusafNtee9VMQ_9Tsfq89C';
  const STORAGE_KEY = 'pulse-finance-v1';
  const CLOUD_TABLE = 'pulse_finance_state';
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const PALETTE = ['#2f80ed', '#16a085', '#ef7f52', '#e0526f', '#745ce6', '#e0a12e', '#17a2b8', '#76839b'];
  const SOFT_PALETTE = ['#e8f3ff', '#e5f8f2', '#fff0e9', '#ffedf0', '#efebff', '#fff6df', '#e8f8fb', '#eef1f5'];

  const defaultCategories = [
    { id: 'food', name: 'Продукты', emoji: '🛒', color: PALETTE[0], soft: SOFT_PALETTE[0], enabled: true },
    { id: 'home', name: 'Квартира', emoji: '⌂', color: PALETTE[1], soft: SOFT_PALETTE[1], enabled: true },
    { id: 'subscriptions', name: 'Подписки', emoji: '▶', color: PALETTE[2], soft: SOFT_PALETTE[2], enabled: true },
    { id: 'health', name: 'Здоровье', emoji: '♡', color: PALETTE[3], soft: SOFT_PALETTE[3], enabled: true },
    { id: 'shopping', name: 'Покупки', emoji: '▢', color: PALETTE[4], soft: SOFT_PALETTE[4], enabled: true },
    { id: 'transport', name: 'Транспорт', emoji: '↗', color: PALETTE[5], soft: SOFT_PALETTE[5], enabled: true },
    { id: 'fun', name: 'Развлечения', emoji: '✦', color: PALETTE[6], soft: SOFT_PALETTE[6], enabled: true },
    { id: 'other', name: 'Другое', emoji: '•', color: PALETTE[7], soft: SOFT_PALETTE[7], enabled: true }
  ];

  const now = new Date();
  let selectedMonth = toMonthKey(now);
  let overviewDay = null;
  let activeFilter = 'planned';
  let analyticsFilter = 'all';
  let unplannedCategoryFilter = 'all';
  let unplannedGranularity = 'week', unplannedDetailCategory = '';
  const Unplanned = window.PulseUnplanned;
  let selectedCategoryId = 'food';
  let state = loadState();
  let activeCloudAccountId = null;
  let supabaseClient = null;
  let currentUser = null;
  let syncTimer = null;
  let realtimeChannel = null;
  let syncInFlight = false;
  let localRevision = 0;
  let pendingPush = false;
  let cloudStatus = '';
  let resendAfter = 0;
  let suppressCloudPush = false;
  let toastTimer = null;
  let cloudInitPromise = null;
  let authBusy = false;
  let activeScreen = 'overview';
  const screenScroll = new Map();

  const $ = id => document.getElementById(id);
  const qsa = selector => Array.from(document.querySelectorAll(selector));


  const ICONS = {pulse:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',home:'<path d="m3 10 9-7 9 7v10H15v-6H9v6H3Z"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',credit:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',chart:'<path d="M4 20V10M12 20V4M20 20v-6"/>',plus:'<path d="M12 5v14M5 12h14"/>',chevron:'<path d="m9 5 7 7-7 7"/>',left:'<path d="m15 5-7 7 7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',health:'<path d="M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11Z"/>',transport:'<path d="m5 8 2-4h10l2 4M4 15v5M20 15v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M6 12h2M16 12h2"/>',tech:'<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M2 20h20M8 16v4M16 16v4"/>',cloud:'<path d="M6 18a4 4 0 0 1 0-8 6 6 0 0 1 12-1 4.5 4.5 0 0 1 0 9Z"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',cart:'<path d="M3 3h2l3 12h11l3-9H6M10 20h.01M18 20h.01"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2ZM9 8h6M9 12h6"/>',refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>'};
  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.grid}</svg>`;
  }
  function categoryVisual(category) {
    const presets = {
      health: ['health', '#f5edf1', '#956c7e'], home: ['home', '#eef0fa', '#6b73a4'],
      transport: ['transport', '#f7f0e5', '#a17b3b'], credit: ['credit', '#edf2fd', '#587cc2'],
      tech: ['tech', '#ebf3f1', '#558479'], food: ['cart', '#eef1f6', '#596b83'],
      shopping: ['grid', '#eef1f6', '#596b83'], other: ['grid', '#eef1f6', '#596b83']
    };
    const preset = presets[category.id];
    return preset ? { markup: icon(preset[0]), soft: preset[1], color: preset[2] }
      : { markup: escapeHtml(category.emoji), soft: category.soft, color: category.color };
  }
  function updateDock() {
    $('addExpenseButton').classList.toggle('hidden', activeScreen === 'loans' || activeScreen === 'payments' || activeScreen === 'unplanned');
    $('addUnplannedButton').classList.toggle('hidden', activeScreen !== 'unplanned');
    $('addLoanButton').classList.toggle('hidden', activeScreen !== 'loans');
    $('addMandatoryPaymentButton').classList.toggle('hidden', activeScreen !== 'payments');
  }
  function openBudgetDialog() {
    renderSettings();
    showSheet($('budgetDialog'));
    $('budgetDialogTitle').focus({ preventScroll: true });
  }

  function makeId(prefix = 'id') {
    if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createInitialState() {
    return {
      meta: {
        version: 1,
        updatedAt: new Date(0).toISOString()
      },
      settings: {
        defaultBudget: 120000,
        budgets: {},
        categories: defaultCategories.map(item => ({ ...item }))
      },
      mandatoryPayments: [],
      loans: [],
      expenses: [],
      unplannedExpenses: []
    };
  }

  function normalizeState(candidate) {
    const fresh = createInitialState();
    if (!candidate || typeof candidate !== 'object') return fresh;
    const settings = candidate.settings && typeof candidate.settings === 'object' ? candidate.settings : {};
    const categories = Array.isArray(settings.categories) && settings.categories.length
      ? settings.categories.map((item, index) => ({
          id: String(item.id || makeId('cat')),
          name: String(item.name || `Категория ${index + 1}`).slice(0, 28),
          emoji: String(item.emoji || '•').slice(0, 32),
          color: item.color || PALETTE[index % PALETTE.length],
          soft: item.soft || SOFT_PALETTE[index % SOFT_PALETTE.length],
          enabled: item.enabled !== false
        }))
      : fresh.settings.categories;

    const fallbackRecordTime = typeof candidate.meta?.updatedAt === 'string' ? candidate.meta.updatedAt : fresh.meta.updatedAt;
    const expenses = Array.isArray(candidate.expenses)
      ? candidate.expenses
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            id: String(item.id || makeId('expense')),
            title: String(item.title || 'Трата').slice(0, 60),
            categoryId: categories.some(category => category.id === item.categoryId) ? item.categoryId : categories[0].id,
            amount: Math.max(0, Number(item.amount) || 0),
            date: isDateKey(item.date) ? item.date : toDateKey(now),
            status: item.status === 'paid' ? 'paid' : 'planned',
            ...(Array.isArray(item.payments) ? { payments: item.payments } : {}),
            cancelled: item.cancelled === true,
            ...(typeof item.mandatoryPaymentId === 'string' ? { mandatoryPaymentId: item.mandatoryPaymentId } : {}),
            createdAt: item.createdAt || fallbackRecordTime,
            updatedAt: item.updatedAt || fallbackRecordTime
          }))
      : [];

    expenses.forEach(expense => { expense.payments = normalizeExpensePayments(expense); refreshExpenseStatus(expense); });

    const mandatoryPayments = Array.isArray(candidate.mandatoryPayments)
      ? candidate.mandatoryPayments
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            id: String(item.id || makeId('payment')),
            title: String(item.title || 'Платёж').slice(0, 60),
            amount: Math.max(0, Math.round((Number(item.amount) || 0) * 100) / 100),
            day: Math.min(31, Math.max(1, Math.trunc(Number(item.day) || 1))),
            createdAt: item.createdAt || fallbackRecordTime,
            updatedAt: item.updatedAt || fallbackRecordTime
          }))
          .filter(item => item.amount > 0)
      : [];

    return {
      meta: {
        version: 1,
        updatedAt: candidate.meta?.updatedAt || new Date().toISOString()
      },
      settings: {
        defaultBudget: Math.max(0, Number(settings.defaultBudget ?? fresh.settings.defaultBudget) || 0),
        budgets: settings.budgets && typeof settings.budgets === 'object' ? { ...settings.budgets } : {},
        categories
      },
      expenses,
      unplannedExpenses: Unplanned.normalize(Array.isArray(candidate.unplannedExpenses)
        ? candidate.unplannedExpenses.map(item => item && typeof item === 'object'
          ? { ...item, createdAt: item.createdAt || fallbackRecordTime, updatedAt: item.updatedAt || fallbackRecordTime }
          : item) : [], categories, toDateKey(now)),
      mandatoryPayments,
      loans: window.PulseLoans.normalize(candidate.loans)
    };
  }

  function moneyCents(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 100)) : 0;
  }
  function expensePayments(expense) {
    if (Array.isArray(expense.payments)) return expense.payments;
    return expense.status === 'paid' && moneyCents(expense.amount) > 0
      ? [{ id: `legacy_${expense.id}`, amount: moneyCents(expense.amount) / 100, date: expense.date,
          createdAt: expense.createdAt, updatedAt: expense.updatedAt, voided: false }] : [];
  }
  function paidAmount(expense) {
    return expensePayments(expense).filter(item => !item.voided).reduce((sum, item) => sum + moneyCents(item.amount), 0) / 100;
  }
  function remainingAmount(expense) {
    return Math.max(0, moneyCents(expense.amount) - moneyCents(paidAmount(expense))) / 100;
  }
  function refreshExpenseStatus(expense) {
    expense.status = remainingAmount(expense) === 0 && moneyCents(expense.amount) > 0 ? 'paid' : 'planned';
  }
  function normalizeExpensePayments(expense) {
    const seen = new Set();
    return expensePayments(expense).filter(item => item && typeof item.id === 'string' && !seen.has(item.id) && seen.add(item.id)
      && Number.isFinite(Number(item.amount)) && moneyCents(item.amount) > 0 && Number(item.amount) <= 1e12)
      .map(item => ({ id: item.id, amount: moneyCents(item.amount) / 100,
        date: isDateKey(item.date) ? item.date : expense.date, voided: item.voided === true,
        createdAt: item.createdAt || expense.createdAt, updatedAt: item.updatedAt || expense.updatedAt }));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : createInitialState();
    } catch (error) {
      console.warn('Не удалось прочитать локальные данные', error);
      return createInitialState();
    }
  }

  function persistState({ push = true } = {}) {
    localRevision += 1;
    state.meta.updatedAt = new Date().toISOString();
    if (!saveLocalState()) return false;
    renderAll();
    if (push && !suppressCloudPush) scheduleCloudPush();
    return true;
  }

  function saveLocalState() {
    try {
      localStorage.setItem(activeCloudAccountId ? STORAGE_KEY + '-account-' + activeCloudAccountId : STORAGE_KEY, JSON.stringify(state));
      if (activeCloudAccountId) localStorage.removeItem?.(STORAGE_KEY);
      return true;
    } catch {
      showToast('Не удалось сохранить данные на устройстве. Экспортируй резервную копию.');
      return false;
    }
  }

  function activateCloudAccount(userId) {
    if (!userId || activeCloudAccountId === userId) return;
    try {
      const owner = localStorage.getItem(STORAGE_KEY + '-owner');
      const saved = localStorage.getItem(STORAGE_KEY + '-account-' + userId);
      // The first login adopts existing legacy local data once; other logins
      // load only their own copy, or start with a clean cloud-bound profile.
      const next = saved ? normalizeState(JSON.parse(saved)) : owner ? createInitialState() : state;
      activeCloudAccountId = userId;
      state = next;
      localRevision += 1;
      if (!saveLocalState()) throw new Error('Local account storage unavailable');
      localStorage.setItem(STORAGE_KEY + '-owner', userId);
      renderAll();
    } catch (error) {
      setSyncState('error', 'Не удалось открыть данные аккаунта');
      showCloudMessage('Не удалось загрузить данные аккаунта с устройства. Освободи место и попробуй ещё раз.', true);
      throw error;
    }
  }

  function deactivateCloudAccount() {
    if (!activeCloudAccountId) return;
    activeCloudAccountId = null;
    state = createInitialState();
    localRevision += 1;
    try { localStorage.removeItem?.(STORAGE_KEY); } catch {}
    renderAll();
  }

  function toMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function isDateKey(value) {
    return window.PulseLoans.validDate(value);
  }

  function monthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const label = MONTHS[month - 1] || '';
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
  }

  function formatMoney(value, compact = false) {
    const amount = Number(value) || 0;
    if (compact && Math.abs(amount) >= 1000000) {
      return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(amount / 1000000)} млн ₽`;
    }
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₽`;
  }

  function formatDate(dateKey) {
    const date = new Date(`${dateKey}T12:00:00`);
    return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
  }

  function expenseWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'трата';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'траты';
    return 'трат';
  }

  function budgetForMonth(monthKey = selectedMonth) {
    const direct = Number(state.settings.budgets?.[monthKey]);
    return Number.isFinite(direct) && direct >= 0 ? direct : Number(state.settings.defaultBudget) || 0;
  }

  function expensesForMonth(monthKey = selectedMonth) {
    return state.expenses
      .filter(expense => !expense.cancelled && expense.date.startsWith(monthKey))
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }

  function plannedExpensesForOverview(expenses) {
    return expenses.filter(expense => !expense.cancelled && expense.status !== 'paid');
  }

  function paymentWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'платёж';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'платежа';
    return 'платежей';
  }

  function mandatoryPaymentsSorted() {
    return [...state.mandatoryPayments].sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, 'ru'));
  }

  function mandatoryPaymentsTotal() {
    return state.mandatoryPayments.reduce((sum, item) => sum + item.amount, 0);
  }

  function categoryById(id) {
    return state.settings.categories.find(item => item.id === id) || state.settings.categories[0] || defaultCategories[7];
  }

  function addMonths(monthKey, delta) {
    const [year, month] = monthKey.split('-').map(Number);
    return toMonthKey(new Date(year, month - 1 + delta, 1));
  }

  function setSelectedMonth(monthKey) {
    selectedMonth = monthKey;
    overviewDay = null;
    renderAll();
  }

  function goCurrentMonth() {
    setSelectedMonth(toMonthKey(new Date()));
  }

  function navigate(screenName) {
    if (!qsa('.screen').some(screen => screen.dataset.screen === screenName)) return;
    screenScroll.set(activeScreen, window.scrollY);
    activeScreen = screenName;
    qsa('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === screenName));
    qsa('.bottom-nav [data-nav]').forEach(button => {
      const active = button.dataset.nav === (['payments', 'plans', 'loans'].includes(screenName) ? 'overview' : screenName);
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    updateDock();
    $('appMain')?.focus({ preventScroll: true });
    window.scrollTo({ top: screenScroll.get(screenName) || 0, behavior: 'instant' });
    if (screenName === 'settings') renderSettings();
  }

  function renderAll() {
    const label = monthLabel(selectedMonth);
    const compactLabel = `${selectedMonth.slice(5, 7)}.${selectedMonth.slice(2, 4)}`;
    $('unplannedMonthLabel').textContent = compactLabel;
    $('unplannedMonthLabel').setAttribute('aria-label', `${label}. Перейти к текущему месяцу`);
    $('unplannedAnalyticsMonthLabel').textContent = compactLabel;
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'].forEach(id => {
      $(id).textContent = compactLabel;
      $(id).setAttribute('aria-label', `${label}. Перейти к текущему месяцу`);
    });
    $('overviewTitle').textContent = `Мой ${MONTHS[Number(selectedMonth.slice(5,7)) - 1]}`;
    renderOverview(); renderPlans(); renderAnalytics(); renderMandatoryPayments(); renderLoans();
    renderSettings(); renderCategoryPicker(); renderUnplanned(); renderUnplannedAnalytics(); updateCloudUi(); updateDock();
    renderPlannedHistory();
    if ($('plannedPaymentDialog').open) renderPlannedPayment();
  }

  function renderOverview() {
    const monthlyExpenses = expensesForMonth();
    const pending = plannedExpensesForOverview(monthlyExpenses);
    const unpaidTotal = pending.reduce((sum, expense) => sum + remainingAmount(expense), 0);
    const budget = budgetForMonth();
    const available = budget - unpaidTotal;
    $('availableAmount').textContent = formatMoney(available, true);
    $('availableAmount').setAttribute('aria-label', formatMoney(available));
    $('availableAmount').classList.toggle('long-value', formatMoney(available).length > 10);
    $('budgetAmount').textContent = formatMoney(budget, true);
    $('overviewYear').textContent = selectedMonth.slice(0, 4);
    renderOverviewCalendar(monthlyExpenses);
    $('overviewPlansLink').textContent = `Все ${pending.length}`;
    const shown = overviewDay ? pending.filter(item => item.date === overviewDay) : pending;
    $('upcomingHeading').textContent = overviewDay ? formatDate(overviewDay) : 'К оплате';
    renderExpenseList($('upcomingList'), shown, { empty: overviewDay ? 'На этот день платежей нет' : 'Пока без трат' });
    const alert = $('budgetAlert');
    alert.classList.toggle('hidden', available >= 0);
    alert.textContent = available < 0 ? `План превышает бюджет на ${formatMoney(-available)}` : '';
  }

  function renderOverviewCalendar(expenses) {
    const today = toDateKey(new Date());
    const anchor = new Date(`${selectedMonth === today.slice(0, 7) ? today : selectedMonth + '-01'}T12:00:00`);
    anchor.setDate(anchor.getDate() - (anchor.getDay() + 6) % 7);
    const days = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
    $('overviewCalendar').innerHTML = days.map((label, index) => {
      const date = new Date(anchor); date.setDate(anchor.getDate() + index);
      const key = toDateKey(date), outside = key.slice(0, 7) !== selectedMonth;
      const count = expenses.filter(item => item.date === key && item.status !== 'paid').length;
      return `<button type="button" data-overview-day="${key}" class="${key === today ? 'is-today' : ''}" aria-pressed="${key === overviewDay}" aria-label="${escapeAttr(formatDate(key))}, платежей: ${count}" ${outside ? 'disabled' : ''}><small>${label}</small><strong>${date.getDate()}</strong><i class="${count ? 'has-payments' : ''}" aria-hidden="true"></i></button>`;
    }).join('');
  }

  function openMonthBuilder() {
    $('builderMonth').value = addMonths(selectedMonth, 1);
    $('builderError').textContent = '';
    renderMonthBuilder();
    showSheet($('monthBuilderDialog'));
    $('builderTitle').focus({ preventScroll: true });
  }

  function renderMonthBuilder() {
    const month = $('builderMonth').value;
    if (!/^\d{4}-\d{2}$/.test(month)) { $('builderRows').innerHTML = ''; updateBuilderSummary(); return; }
    const [year, number] = month.split('-').map(Number);
    const last = new Date(year, number, 0).getDate();
    const planned = state.expenses.filter(item => item.date.slice(0, 7) === month);
    $('builderRows').innerHTML = mandatoryPaymentsSorted().map(payment => {
      const existing = planned.find(item => item.mandatoryPaymentId === payment.id);
      const date = existing?.date || `${month}-${String(Math.min(payment.day, last)).padStart(2, '0')}`;
      const amount = existing?.amount ?? payment.amount;
      return `<article class="builder-row ${existing ? 'already-planned' : ''}" data-builder-id="${escapeAttr(payment.id)}">
        <div class="builder-selection"><label><input type="checkbox" data-builder-selected checked ${existing ? 'disabled' : ''}/><span><strong>${escapeHtml(payment.title)}</strong><small>${existing ? 'Уже в плане' : escapeHtml(formatDate(date))}</small></span></label><span class="nums">${escapeHtml(formatMoney(amount))}</span></div>
        ${existing ? '' : `<details class="builder-edit"><summary>Сумма и дата ${icon('edit')}</summary><div class="builder-fields"><label>Сумма, ₽<input type="number" data-builder-amount min="0.01" step="0.01" inputmode="decimal" value="${amount}" aria-label="${escapeAttr(payment.title)}: сумма" /></label><label>Дата<input type="date" data-builder-date min="${month}-01" max="${month}-${last}" value="${date}" aria-label="${escapeAttr(payment.title)}: дата" /></label></div></details>`}
      </article>`;
    }).join('') || '<div class="empty-state"><strong>Пока нет регулярных платежей</strong><small>Сначала добавь интернет, подписки или другие повторяющиеся расходы.</small></div>';
    updateBuilderSummary();
  }

  function selectedBuilderRows() {
    return qsa('#builderRows [data-builder-id]').filter(row => {
      const checkbox = row.querySelector('[data-builder-selected]');
      return checkbox.checked && !checkbox.disabled;
    });
  }

  function updateBuilderSummary() {
    const rows = selectedBuilderRows();
    for (const row of rows) {
      const amount = Number(row.querySelector('[data-builder-amount]').value);
      const date = row.querySelector('[data-builder-date]').value;
      row.querySelector('.builder-selection > .nums').textContent = Number.isFinite(amount) ? formatMoney(amount) : '—';
      if (isDateKey(date)) row.querySelector('.builder-selection small').textContent = formatDate(date);
    }
    const total = rows.reduce((sum, row) => sum + Number(row.querySelector('[data-builder-amount]').value || 0), 0);
    $('builderCount').textContent = `Выбрано ${rows.length} ${paymentWord(rows.length)}`;
    $('builderTotal').textContent = Number.isFinite(total) ? formatMoney(total) : 'Проверь сумму';
    $('builderSubmit').disabled = rows.length === 0;
  }

  function saveMonthBuilder(event) {
    event.preventDefault();
    const month = $('builderMonth').value, rows = selectedBuilderRows();
    const error = $('builderError'); error.textContent = '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { error.textContent = 'Выбери месяц плана.'; return; }
    const additions = [];
    for (const row of rows) {
      const payment = state.mandatoryPayments.find(item => item.id === row.dataset.builderId);
      if (!payment || state.expenses.some(item => item.mandatoryPaymentId === payment.id && item.date.slice(0, 7) === month)) continue;
      const amount = Number(row.querySelector('[data-builder-amount]').value);
      const date = row.querySelector('[data-builder-date]').value;
      if (!Number.isFinite(amount) || amount < 0.01 || amount > 999999999) { error.textContent = 'Укажи сумму платежа от 0,01 до 999 999 999 ₽.'; row.querySelector('details').open = true; row.querySelector('[data-builder-amount]').focus(); return; }
      if (!isDateKey(date) || date.slice(0, 7) !== month) { error.textContent = 'Дата платежа должна попадать в выбранный месяц.'; row.querySelector('details').open = true; row.querySelector('[data-builder-date]').focus(); return; }
      const timestamp = new Date().toISOString();
      additions.push({ id: makeId('expense'), mandatoryPaymentId: payment.id, title: payment.title, amount, date,
        categoryId: state.settings.categories.find(item => item.id === 'home')?.id || state.settings.categories[0].id,
        status: 'planned', createdAt: timestamp, updatedAt: timestamp });
    }
    if (!additions.length) { renderMonthBuilder(); return; }
    const before = state.expenses, previousUpdatedAt = state.meta.updatedAt;
    state.expenses = [...state.expenses, ...additions];
    if (!persistState()) { state.expenses = before; state.meta.updatedAt = previousUpdatedAt; error.textContent = 'Не удалось сохранить платежи. Освободи место на устройстве и повтори.'; return; }
    closeSheet($('monthBuilderDialog'));
    setSelectedMonth(month);
    showToast(`Добавлено ${additions.length} ${paymentWord(additions.length)} в ${monthLabel(month)}`);
  }

  function renderMandatoryPayments() {
    const payments = mandatoryPaymentsSorted();
    $('mandatoryPaymentsTotal').textContent = formatMoney(mandatoryPaymentsTotal());
    $('mandatoryPaymentsCount').textContent = `${payments.length} ${paymentWord(payments.length)}`;
    $('mandatoryPaymentsList').innerHTML = payments.length ? payments.map(payment => `
      <div class="expense payment-card">
        <span class="categoryicon home">${icon('receipt')}</span>
        <button class="details payment-copy" type="button" data-edit-mandatory-payment="${escapeAttr(payment.id)}" aria-label="Изменить регулярный платеж ${escapeAttr(payment.title)}"><strong>${escapeHtml(payment.title)}</strong><small>${payment.day} числа каждого месяца</small></button>
        <strong class="amount nums">${escapeHtml(formatMoney(payment.amount))}</strong>
        <button class="textbtn" type="button" data-plan-payment="${escapeAttr(payment.id)}" aria-label="Добавить ${escapeAttr(payment.title)} в план">${icon('plus')}</button>
      </div>`).join('') : '<div class="empty-state"><strong>Повторяющиеся расходы</strong><small>Например, интернет, аренда или подписка. Сумма и день будут сохранены для следующих месяцев.</small></div>';
  }

  function openMandatoryPaymentDialog(id = null) {
    const payment = state.mandatoryPayments.find(item => item.id === id);
    $('mandatoryPaymentForm').reset();
    $('mandatoryPaymentError').textContent = '';
    $('mandatoryPaymentId').value = payment?.id || '';
    $('mandatoryPaymentTitle').value = payment?.title || '';
    $('mandatoryPaymentAmount').value = payment?.amount || '';
    $('mandatoryPaymentDay').value = payment?.day || new Date().getDate();
    $('mandatoryPaymentDialogTitle').textContent = payment ? 'Изменить платёж' : 'Добавить платёж';
    $('deleteMandatoryPaymentButton').classList.toggle('hidden', !payment);
    showSheet($('mandatoryPaymentDialog'));
  }

  function saveMandatoryPayment(event) {
    event.preventDefault();
    const title = $('mandatoryPaymentTitle').value.trim();
    const amount = Number($('mandatoryPaymentAmount').value);
    const day = Number($('mandatoryPaymentDay').value);
    let error = '';
    if (!title) error = 'Укажи название платежа';
    else if (!Number.isFinite(amount) || amount < 0.01 || amount > 1e12) error = 'Укажи сумму платежа';
    else if (!Number.isInteger(day) || day < 1 || day > 31) error = 'Укажи день месяца от 1 до 31';
    if (error) { $('mandatoryPaymentError').textContent = error; return; }

    const existing = state.mandatoryPayments.find(item => item.id === $('mandatoryPaymentId').value);
    const before = state.mandatoryPayments.map(item => ({ ...item }));
    const payment = {
      id: existing?.id || makeId('payment'),
      title: title.slice(0, 60),
      amount: Math.round(amount * 100) / 100,
      day,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, payment);
    else state.mandatoryPayments.push(payment);
    if (!persistState()) {
      state.mandatoryPayments = before;
      $('mandatoryPaymentError').textContent = 'Не удалось сохранить платёж. Освободи место на устройстве и повтори.';
      return;
    }
    closeSheet($('mandatoryPaymentDialog'));
    showToast(existing ? 'Платёж обновлён' : 'Платёж добавлен');
  }

  function deleteMandatoryPayment() {
    const payment = state.mandatoryPayments.find(item => item.id === $('mandatoryPaymentId').value);
    if (!payment || !window.confirm(`Удалить платёж «${payment.title}»?`)) return;
    const before = state.mandatoryPayments;
    state.mandatoryPayments = state.mandatoryPayments.filter(item => item.id !== payment.id);
    if (!persistState()) { state.mandatoryPayments = before; return; }
    closeSheet($('mandatoryPaymentDialog'));
    showToast('Платёж удалён');
  }

  function handleMandatoryPaymentClick(event) {
    const edit = event.target.closest('[data-edit-mandatory-payment]');
    if (edit) openMandatoryPaymentDialog(edit.dataset.editMandatoryPayment);
    const plan = event.target.closest('[data-plan-payment]');
    if (plan) addMandatoryPaymentToPlan(plan.dataset.planPayment);
  }

  function addMandatoryPaymentToPlan(id) {
    const payment = state.mandatoryPayments.find(item => item.id === id);
    if (!payment) return;
    if (expensesForMonth().some(item => item.mandatoryPaymentId === id)) return showToast('Этот платеж уже добавлен в план');
    const [year, month] = selectedMonth.split('-').map(Number);
    const day = Math.min(payment.day, new Date(year, month, 0).getDate());
    const timestamp = new Date().toISOString();
    const expense = { id: makeId('expense'), mandatoryPaymentId: id, title: payment.title, amount: payment.amount,
      categoryId: state.settings.categories.find(item => item.id === 'home')?.id || state.settings.categories[0].id,
      date: `${selectedMonth}-${String(day).padStart(2, '0')}`, status: 'planned', createdAt: timestamp, updatedAt: timestamp };
    state.expenses.push(expense);
    if (!persistState()) { state.expenses = state.expenses.filter(item => item.id !== expense.id); return; }
    showToast('Платеж добавлен в план');
  }

  function renderLoans() {
    const missing = state.loans.filter(loan => loan.balance === null).length;
    const totalDebt = state.loans.reduce((sum, loan) => sum + (loan.balance || 0), 0);
    const monthlyTotal = state.loans.reduce((sum, loan) => sum + loan.payment, 0);
    $('loansTotal').textContent = missing ? (missing === state.loans.length ? 'Не указан' : 'Сумма неполная') : formatMoney(totalDebt);
    $('loansTotalHint').textContent = missing ? `${missing < state.loans.length ? `Указано ${formatMoney(totalDebt)}. ` : ''}Заполните остаток долга по ${missing} из ${state.loans.length} кредитов` : 'По всем добавленным кредитам';
    $('loansCount').textContent = $('loansListCount').textContent = String(state.loans.length);
    $('loansMonthly').textContent = formatMoney(monthlyTotal);
    const loans = [...state.loans].sort((a, b) => a.paymentDay - b.paymentDay || a.title.localeCompare(b.title, 'ru'));
    $('loansDirectory').innerHTML = loans.length ? loans.map(loan => `
      <section class="creditrow loan-card">
        <button class="loan-main" type="button" data-edit-loan="${escapeAttr(loan.id)}" aria-label="Изменить кредит ${escapeAttr(loan.title)}">
          <span class="categoryicon credit">${icon('credit')}</span><span class="loan-copy"><strong>${escapeHtml(loan.title)}</strong><small>Каждый месяц · ${loan.paymentDay} числа</small></span><strong class="nums" style="font-size:15px">${escapeHtml(formatMoney(loan.payment))}</strong>
        </button>
        <div class="credit-bottom"><span>Остаток долга: ${loan.balance === null ? 'не указан' : escapeHtml(formatMoney(loan.balance))}</span><button type="button" data-edit-loan="${escapeAttr(loan.id)}">${loan.balance === null ? 'Указать' : 'Изменить'}</button></div>
      </section>`).join('') : '<div class="empty-state"><strong>Кредитов пока нет</strong><small>Добавьте кредит, чтобы видеть общую задолженность и платежи в месяц.</small></div>';
  }

  function openLoanDialog(id = null) {
    const loan = state.loans.find(item => item.id === id);
    $('loanForm').reset();
    $('loanError').textContent = '';
    $('loanId').value = loan?.id || '';
    $('loanTitle').value = loan?.title || '';
    $('loanBalance').value = loan?.balance ?? '';
    $('loanDay').value = loan?.paymentDay || Number((loan?.firstDate || toDateKey(new Date())).slice(8));
    $('loanPayment').value = loan?.payment || '';
    $('loanFirstDate').value = loan?.firstDate || (selectedMonth === toMonthKey(new Date()) ? toDateKey(new Date()) : `${selectedMonth}-01`);
    $('loanEndDate').value = loan?.endDate || '';
    $('loanDialogTitle').textContent = loan ? 'Изменить кредит' : 'Новый кредит';
    $('deleteLoanButton').classList.toggle('hidden', !loan);
    showSheet($('loanDialog'));
    $('loanDialogTitle').focus({ preventScroll: true });
  }

  function saveLoan(event) {
    event.preventDefault();
    const title = $('loanTitle').value.trim();
    const balanceText = $('loanBalance').value.trim();
    const balance = balanceText === '' ? null : Number(balanceText);
    const paymentDay = Number($('loanDay').value);
    const payment = Number($('loanPayment').value);
    const firstDate = $('loanFirstDate').value;
    const endDate = $('loanEndDate').value;
    let error = '';
    if (!title) error = 'Укажи название кредита';
    else if (balance !== null && (!Number.isFinite(balance) || balance < 0 || balance > 1e15)) error = 'Укажи корректный остаток задолженности';
    else if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) error = 'Укажи день платежа от 1 до 31';
    else if (!Number.isFinite(payment) || payment < 0.01 || payment > 1e12) error = 'Укажи ежемесячный платеж';
    else if (!isDateKey(firstDate)) error = 'Выбери дату ближайшего платежа';
    else if (endDate && (!isDateKey(endDate) || endDate < firstDate)) error = 'Дата окончания не может быть раньше ближайшего платежа';
    if (error) { $('loanError').textContent = error; return; }

    const existing = state.loans.find(item => item.id === $('loanId').value);
    const before = state.loans.map(item => ({ ...item, paidMonths: [...(item.paidMonths || [])] }));
    const loan = {
      id: existing?.id || makeId('loan'),
      title: title.slice(0, 60),
      balance: balance === null ? null : Math.round(balance * 100) / 100,
      paymentDay,
      payment: Math.round(payment * 100) / 100,
      firstDate,
      endDate,
      closed: false,
      paidMonths: existing?.paidMonths || [],
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, loan);
    else state.loans.push(loan);
    if (!persistState()) {
      state.loans = before;
      $('loanError').textContent = 'Не удалось сохранить кредит. Освободи место на устройстве и повтори.';
      return;
    }
    closeSheet($('loanDialog'));
    showToast(existing ? 'Кредит обновлен' : 'Кредит добавлен');
  }

  function handleLoanClick(event) {
    const edit = event.target.closest('[data-edit-loan]');
    if (edit) openLoanDialog(edit.dataset.editLoan);
  }

  function deleteLoan() {
    const loan = state.loans.find(item => item.id === $('loanId').value);
    if (!loan || !window.confirm(`Удалить кредит «${loan.title}»?`)) return;
    const previous = state.loans;
    state.loans = state.loans.filter(item => item.id !== loan.id);
    if (!persistState()) { state.loans = previous; return; }
    closeSheet($('loanDialog'));
    showToast('Кредит удалён');
  }

  function renderPlans() {
    qsa('[data-filter]').forEach(button => {
      const active = button.dataset.filter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const monthlyExpenses = expensesForMonth();
    const filtered = activeFilter === 'all' ? monthlyExpenses : monthlyExpenses.filter(expense => activeFilter === 'paid' ? paidAmount(expense) > 0 : expense.status !== 'paid');
    $('plansTotal').textContent = formatMoney(filtered.reduce((sum, expense) => sum + (activeFilter === 'paid' ? paidAmount(expense) : activeFilter === 'planned' ? remainingAmount(expense) : expense.amount), 0));
    $('plansCount').textContent = `${filtered.length} ${expenseWord(filtered.length)}`;
    $('plansTotalLabel').textContent = { planned: 'Предстоит оплатить', paid: 'Уже оплачено', all: 'Все траты в плане' }[activeFilter];
    $('plansPeriod').textContent = monthLabel(selectedMonth);
    renderExpenseList($('plansList'), filtered, { empty: activeFilter === 'paid' ? 'Оплаченных трат пока нет' : 'Пока без трат' });
  }

  function renderExpenseList(container, expenses, options = {}) {
    if (!container) return;
    const list = typeof options.limit === 'number' ? expenses.slice(0, options.limit) : expenses;
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><strong>${escapeHtml(options.empty || 'Пока без трат')}</strong><small>Добавьте трату для выбранного месяца.</small></div>`;
      return;
    }
    container.innerHTML = list.map(expense => {
      const category = categoryById(expense.categoryId), visual = categoryVisual(category), paid = expense.status === 'paid';
      return `<div class="planned-expense"><div class="expense expense-row">
        ${container.id === 'upcomingList' ? `<span class="expense-date" aria-hidden="true"><strong>${Number(expense.date.slice(8))}</strong><small>${MONTHS[Number(expense.date.slice(5,7)) - 1].slice(0,3)}</small></span>` : ''}
        <span class="categoryicon category-icon" style="background:${escapeAttr(visual.soft)};color:${escapeAttr(visual.color)}">${visual.markup}</span>
        <button class="details" type="button" data-expense-id="${escapeAttr(expense.id)}" aria-label="Редактировать ${escapeAttr(expense.title)}"><strong>${escapeHtml(expense.title)}</strong><small>${escapeHtml(category.name)} · ${escapeHtml(formatDate(expense.date))}</small></button>
        <span class="amount nums">${escapeHtml(formatMoney(expense.amount))}</span>
        <button class="check ${paid ? 'done' : ''}" type="button" data-complete-expense="${escapeAttr(expense.id)}" aria-pressed="${paid}" aria-label="${paid ? 'Вернуть в план: ' : 'Оплатить весь остаток: '}${escapeAttr(expense.title)}">${icon('check')}</button>
      </div><div class="planned-progress-row">
        <div class="planned-progress-copy"><span>${paid ? 'Оплачено' : paidAmount(expense) > 0 ? 'Частично оплачено' : 'Осталось'} <b class="nums">${escapeHtml(formatMoney(paidAmount(expense) > 0 ? paidAmount(expense) : remainingAmount(expense)))}</b></span>
        ${paidAmount(expense) > 0 && !paid ? `<span>Осталось <b class="nums">${escapeHtml(formatMoney(remainingAmount(expense)))}</b></span>` : ''}
        <progress max="${Math.max(1, moneyCents(expense.amount))}" value="${Math.min(moneyCents(expense.amount), moneyCents(paidAmount(expense)))}" aria-label="Оплачено: ${escapeAttr(formatMoney(paidAmount(expense)))} из ${escapeAttr(formatMoney(expense.amount))}"></progress></div>
        <button type="button" class="planned-pay-button" data-pay-expense="${escapeAttr(expense.id)}">${paid ? 'Оплаты' : 'Внести'}</button>
      </div></div>`;
    }).join('');
    container.querySelectorAll('[data-pay-expense]').forEach(button => button.addEventListener('click', () => openPlannedPayment(button.dataset.payExpense)));
    container.querySelectorAll('[data-expense-id]').forEach(button => button.addEventListener('click', () => openExpenseDialog(button.dataset.expenseId)));
    container.querySelectorAll('[data-complete-expense]').forEach(button => button.addEventListener('click', () => completeExpense(button.dataset.completeExpense)));
  }

  function renderAnalytics() {
    const items = analyticsFilter === 'all' ? expensesForMonth() : state.expenses.flatMap(expense =>
      expensePayments(expense).filter(payment => !payment.voided && payment.date.startsWith(selectedMonth))
        .map(payment => ({ ...expense, amount: payment.amount, date: payment.date })));
    const total = items.reduce((sum, expense) => sum + expense.amount, 0), budget = budgetForMonth();
    $('analyticsTotalLabel').textContent = analyticsFilter === 'paid' ? 'Оплачено' : 'Все траты';
    $('analyticsPlanned').textContent = formatMoney(total);
    $('analyticsCount').textContent = `${items.length} ${expenseWord(items.length)}`;
    $('analyticsBudgetPercent').textContent = budget > 0 ? `${Math.round(total / budget * 100)}%` : '—';
    $('analyticsBudget').textContent = budget > 0 ? `Бюджет ${formatMoney(budget)}` : 'Бюджет не задан';
    $('analyticsCategoryLabel').textContent = analyticsFilter === 'paid' ? 'Оплаченные траты' : 'Все запланированные траты';
    const totals = new Map();
    items.forEach(expense => totals.set(expense.categoryId, (totals.get(expense.categoryId) || 0) + expense.amount));
    const rows = [...totals.entries()].map(([id, amount]) => ({ category: categoryById(id), amount })).sort((a, b) => b.amount - a.amount);
    $('categoryBreakdown').innerHTML = total > 0 ? rows.map(row => {
      const chartColors = { health: '#936d83', home: '#747da9', transport: '#ac8747', credit: '#6286c5', tech: '#5b8e7b', other: '#8794a6' };
      const color = chartColors[row.category.id] || categoryVisual(row.category).color;
      return `<div class="barrow"><div class="bartext"><span class="key"><i style="background:${escapeAttr(color)}"></i>${escapeHtml(row.category.name)}</span><strong class="nums">${escapeHtml(formatMoney(row.amount))}</strong></div><div class="bar"><span style="width:${row.amount / total * 100}%;background:${escapeAttr(color)}"></span></div></div>`;
    }).join('') : '<p class="note">За этот месяц данных пока нет.</p>';
    const [year, month] = selectedMonth.split('-').map(Number), days = new Date(year, month, 0).getDate();
    const weekly = Array(Math.ceil(days / 7)).fill(0);
    items.forEach(expense => { weekly[Math.floor((Number(expense.date.slice(8)) - 1) / 7)] += expense.amount; });
    const max = Math.max(...weekly, 1);
    $('weekChart').innerHTML = weekly.map((amount, index) => `<div class="weekcol"><b>${escapeHtml(new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount))}</b><div class="weekbar" style="height:${amount > 0 ? Math.max(3, amount / max * 75) : 0}px"></div><span>${index * 7 + 1}–${Math.min(index * 7 + 7, days)}</span></div>`).join('');
    $('weekChart').setAttribute('aria-label', `Суммы по семидневным периодам: ${weekly.map(amount => formatMoney(amount)).join(', ')}`);
  }

function populateUnplannedCategoryOptions(){
  const categoryInput=$('unplannedCategory');
  if(!categoryInput)return;
  const current=categoryInput.value;
  categoryInput.innerHTML=state.settings.categories.map(cat=>`<option value="${escapeAttr(cat.id)}">${escapeHtml(cat.name)}</option>`).join('');
  if(state.settings.categories.some(cat=>cat.id===current))categoryInput.value=current;
}

function unplannedScope(){
  return Unplanned.periodBounds('month',selectedMonth);
}

function unplannedEntries(which,category='all'){
  return Unplanned.filter(state.unplannedExpenses,unplannedScope(which),category);
}

function unplannedRowMarkup(item){
  const category=categoryById(item.categoryId);
  return `<button type="button" class="unplanned-operation" data-edit-unplanned="${escapeAttr(item.id)}" aria-label="Изменить незапланированную трату: ${escapeAttr(category.name)}, ${escapeAttr(formatMoney(item.amount))}">
      <span class="unplanned-operation-date">${escapeHtml(formatDate(item.date))}<small>${escapeHtml(item.date.slice(0,4))}</small></span>
      <span class="unplanned-operation-info"><strong>${escapeHtml(category.name)}</strong>${item.comment?`<small>${escapeHtml(item.comment)}</small>`:''}</span>
      <strong class="unplanned-operation-amount nums">${escapeHtml(formatMoney(item.amount))}</strong>
    </button>`;
}

function renderUnplanned(){
  const categoryInput=$('unplannedFilterCategory');
  const categories=state.settings.categories;
  if(unplannedCategoryFilter!=='all'&&!categories.some(cat=>cat.id===unplannedCategoryFilter))unplannedCategoryFilter='all';
  categoryInput.innerHTML='<option value="all">Все категории</option>'+categories.map(cat=>`<option value="${escapeAttr(cat.id)}">${escapeHtml(cat.name)}</option>`).join('');
  categoryInput.value=unplannedCategoryFilter;
  const items=unplannedEntries('list',unplannedCategoryFilter);
  const stats=Unplanned.summary(items,categories);
  const {recent,older}=Unplanned.splitRecent(items,10);
  $('unplannedTotal').textContent=formatMoney(stats.total);
  $('unplannedTotalCount').textContent=`${stats.count} ${expenseWord(stats.count)}`;
  $('unplannedList').innerHTML=recent.length?recent.map(unplannedRowMarkup).join(''):'<div class="unplanned-empty"><strong>Пока без незапланированных трат</strong></div>';
  $('unplannedHistoryButton').classList.toggle('hidden',older.length===0);
  $('unplannedHistoryCount').textContent=`Ещё ${older.length} ${expenseWord(older.length)}`;
  $('unplannedHistoryLabel').textContent=unplannedCategoryFilter==='all'?'Ранее в этом месяце':'Ранее в выбранной категории';
  $('unplannedHistoryList').innerHTML=older.map(unplannedRowMarkup).join('');
  if(older.length===0&&$('unplannedHistoryDialog').open)closeSheet($('unplannedHistoryDialog'));
}

function openUnplannedDialog(id=''){
  const record=id?state.unplannedExpenses.find(item=>item.id===id):null;
  if(id&&!record)return;
  $('unplannedForm').reset();
  $('unplannedId').value=record?.id||'';
  $('unplannedAmount').value=record?.amount??'';
  $('unplannedDate').value=record?.date||(selectedMonth===toMonthKey(new Date())?toDateKey(new Date()):selectedMonth+'-01');
  $('unplannedComment').value=record?.comment||'';
  $('unplannedError').textContent='';
  $('unplannedDialogTitle').textContent=record?'Изменить трату':'Незапланированная трата';
  $('saveUnplannedButton').textContent=record?'Сохранить изменения':'Добавить трату';
  $('deleteUnplannedButton').classList.toggle('hidden',!record);
  populateUnplannedCategoryOptions();
  $('unplannedCategory').value=record?.categoryId||state.settings.categories.find(x=>x.enabled!==false)?.id||state.settings.categories[0]?.id||'';
  showSheet($('unplannedDialog'));
}

function saveUnplanned(event){
  event.preventDefault();
  const form=$('unplannedForm');
  if(form.closest('dialog')?.inert)return;
  const id=$('unplannedId').value;
  const fields={
    amount:$('unplannedAmount').value,categoryId:$('unplannedCategory').value,
    date:$('unplannedDate').value,comment:$('unplannedComment').value.trim()
  };
  const error=Unplanned.validate(fields,state.settings.categories.map(x=>x.id));
  if(error){$('unplannedError').textContent=error;return;}
  if(id&&!state.unplannedExpenses.some(item=>item.id===id)){showToast('Запись больше не существует');return;}
  const before=state.unplannedExpenses.map(x=>({...x}));
  const timestamp=new Date().toISOString();
  const existing=state.unplannedExpenses.find(x=>x.id===id);
  const record={id:existing?.id||makeId('unplanned'),amount:Unplanned.money(fields.amount),
    categoryId:fields.categoryId,date:fields.date,comment:fields.comment,
    createdAt:existing?.createdAt||timestamp,updatedAt:timestamp};
  if(existing)Object.assign(existing,record);
  else state.unplannedExpenses.push(record);
  if(!persistState()){state.unplannedExpenses=before;renderAll();return;}
  closeSheet($('unplannedDialog'));
  showToast(existing?'Трата изменена':'Незапланированная трата добавлена');
}

function deleteUnplanned(){
  const id=$('unplannedId').value;
  const previous=state.unplannedExpenses.find(item=>item.id===id);
  if(!previous||!window.confirm('Удалить незапланированную трату?'))return;
  const before=state.unplannedExpenses.map(item=>({...item}));
  state.unplannedExpenses=state.unplannedExpenses.filter(item=>item.id!==id);
  if(!persistState()){state.unplannedExpenses=before;renderAll();return;}
  closeSheet($('unplannedDialog'));
  showToast('Трата удалена',()=>{
    if(state.unplannedExpenses.some(item=>item.id===previous.id))return;
    state.unplannedExpenses.push(previous);
    persistState();
  });
}

function renderUnplannedAnalytics(){
  $('unplannedAnalyticsGranularity').value=unplannedGranularity;
  const items=unplannedEntries('analytics'),summary=Unplanned.summary(items,state.settings.categories);
  $('unplannedAnalyticsTotal').textContent=formatMoney(summary.total);
  $('unplannedAnalyticsCount').textContent=String(summary.count);
  $('unplannedAnalyticsAverage').textContent=formatMoney(summary.average);
  $('unplannedAnalyticsTop').textContent=summary.topCategory;
  const colors=summary.categories.map((_,i)=>PALETTE[i%PALETTE.length]);
  let position=0;
  const segments=summary.categories.map((row,i)=>{
    const beginning=position;
    position+=row.amount/summary.total*100;
    return `${colors[i]} ${beginning.toFixed(3)}% ${position.toFixed(3)}%`;
  });
  $('unplannedDonut').style.background=segments.length?`conic-gradient(${segments.join(',')})`:'#e9e7ee';
  $('unplannedDonut').setAttribute('aria-label',segments.length?`Расходы по категориям: ${summary.categories.map(row=>`${row.name} ${row.percent}%`).join(', ')}`:'Нет незапланированных трат');
  $('unplannedCategoryChart').innerHTML=summary.categories.length?summary.categories.map((row,i)=>`<button type="button" class="unplanned-category-row ${unplannedDetailCategory===row.id?'selected':''}" data-unplanned-detail="${escapeAttr(row.id)}" aria-expanded="${unplannedDetailCategory===row.id}">
    <span class="unplanned-category-label"><i style="background:${colors[i]}"></i>${escapeHtml(row.name)}</span>
    <span class="nums">${escapeHtml(formatMoney(row.amount))}<small>${row.percent}%</small></span>
  </button>`).join(''):'<p class="note">Нет расходов за выбранный период.</p>';
  const selected=summary.categories.find(row=>row.id===unplannedDetailCategory);
  const details=$('unplannedDrilldown');
  details.classList.toggle('hidden',!selected);
  if(selected){
    const rows=Unplanned.filter(items,{start:'',end:''},selected.id);
    details.innerHTML=`<div class="unplanned-detail-title"><strong>${escapeHtml(selected.name)}</strong><button type="button" data-unplanned-detail-close aria-label="Свернуть">×</button></div>`+
      rows.map(row=>`<div class="unplanned-detail-row"><span>${escapeHtml(formatDate(row.date))}${row.comment?`<small>${escapeHtml(row.comment)}</small>`:''}</span><strong class="nums">${escapeHtml(formatMoney(row.amount))}</strong></div>`).join('');
  }else details.innerHTML='';
  const buckets=Unplanned.timeline(items,unplannedGranularity);
  const display=buckets.slice(-12),max=Math.max(1,...display.map(row=>row.amount));
  $('unplannedTimeline').innerHTML=display.length?display.map(row=>`<div class="unplanned-timeline-col">
    <small class="nums">${escapeHtml(new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(row.amount))}</small>
    <div class="unplanned-timeline-bar" style="height:${Math.max(4,Math.round(row.amount/max*84))}px"></div>
    <span>${escapeHtml(unplannedGranularity==='month'?row.date.slice(5):row.date.slice(5))}</span></div>`).join(''):'<p class="note">Данных пока нет.</p>';
  $('unplannedTimeline').setAttribute('aria-label',display.map(row=>`${row.date}: ${formatMoney(row.amount)}`).join(', ')||'Данных пока нет');
  $('unplannedTimelineHint').textContent=buckets.length>12?'Показаны последние 12 периодов. Суммы в рублях.':'Суммы в рублях за выбранный период.';
}

  function renderBudgetPreview() {
    const planned = plannedExpensesForOverview(expensesForMonth()).reduce((sum, expense) => sum + remainingAmount(expense), 0);
    const budget = Number($('budgetInput').value);
    $('budgetPlannedAmount').textContent = formatMoney(planned);
    $('budgetRemainingAmount').textContent = $('budgetInput').value === '' || !Number.isFinite(budget) ? '—' : formatMoney(budget - planned);
    $('budgetRemainingAmount').classList.toggle('negative', $('budgetInput').value !== '' && Number.isFinite(budget) && budget < planned);
  }

  function renderSettings() {
    if (!$('budgetDialog').open) $('budgetInput').value = budgetForMonth();
    $('settingsBudgetLabel').textContent = `${monthLabel(selectedMonth)} · ${formatMoney(budgetForMonth())}`;
    $('budgetDialogPeriod').textContent = monthLabel(selectedMonth);
    renderBudgetPreview();
    renderCategoryManagement();
  }

  function renderCategoryManagement() {
    const container = $('categoryManageList');
    container.innerHTML = state.settings.categories.map(category => `
      <div class="category-manage-row">
        <span class="mini-icon" style="background:${escapeAttr(category.soft)};color:${escapeAttr(category.color)}">${escapeHtml(category.emoji)}</span>
        <strong>${escapeHtml(category.name)}</strong>
        <button class="mini-switch ${category.enabled !== false ? 'on' : ''}" type="button" data-toggle-category="${escapeAttr(category.id)}" aria-label="${category.enabled !== false ? 'Скрыть' : 'Показать'} категорию ${escapeAttr(category.name)}" aria-pressed="${category.enabled !== false}"></button>
      </div>`).join('');

    container.querySelectorAll('[data-toggle-category]').forEach(button => {
      button.addEventListener('click', () => {
        const category = state.settings.categories.find(item => item.id === button.dataset.toggleCategory);
        if (!category) return;
        const enabledCount = state.settings.categories.filter(item => item.enabled !== false).length;
        if (category.enabled !== false && enabledCount <= 1) {
          showToast('Нужна хотя бы одна активная категория');
          return;
        }
        category.enabled = category.enabled === false;
        persistState();
      });
    });
  }

  function renderCategoryPicker() {
    const editing = Boolean($('expenseId').value);
    const available = state.settings.categories.filter(category => category.enabled !== false || (editing && category.id === selectedCategoryId));
    if (!available.some(category => category.id === selectedCategoryId)) selectedCategoryId = available[0]?.id || state.settings.categories[0]?.id;
    $('categoryPicker').innerHTML = available.map(category => `<option value="${escapeAttr(category.id)}" ${category.id === selectedCategoryId ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
  }

  function openExpenseDialog(expenseId = null) {
    const dialog = $('expenseDialog');
    const expense = expenseId ? state.expenses.find(item => item.id === expenseId) : null;
    $('expenseForm').reset();
    $('expenseId').value = expense?.id || '';
    $('expenseError').textContent = '';
    $('expenseDialogTitle').textContent = expense ? 'Редактировать трату' : 'Новая трата';
    $('saveExpenseButton').textContent = expense ? 'Сохранить изменения' : 'Добавить в план';
    $('deleteExpenseButton').classList.toggle('hidden', !expense);

    if (expense) {
      $('expenseTitle').value = expense.title;
      $('expenseAmount').value = expense.amount;
      $('expenseDate').value = expense.date;
      $('expensePaid').checked = expense.status === 'paid';
      selectedCategoryId = expense.categoryId;
    } else {
      const today = new Date();
      const targetDate = selectedMonth === toMonthKey(today) ? today : new Date(`${selectedMonth}-01T12:00:00`);
      $('expenseDate').value = toDateKey(targetDate);
      $('expensePaid').checked = false;
      const first = state.settings.categories.find(category => category.enabled !== false);
      selectedCategoryId = state.settings.categories.some(category => category.id === selectedCategoryId && category.enabled !== false)
        ? selectedCategoryId : first?.id || state.settings.categories[0]?.id || 'other';
    }
    renderCategoryPicker();
    showSheet(dialog);
    $('expenseDialogTitle').focus({ preventScroll: true });
  }

  function closeExpenseDialog() {
    if ($('expenseDialog').open) closeSheet($('expenseDialog'));
  }

  function saveExpense(event) {
    event.preventDefault();
    const title = $('expenseTitle').value.trim();
    const amount = Number($('expenseAmount').value);
    const date = $('expenseDate').value;
    if (!title) { $('expenseError').textContent = 'Укажите название траты'; return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) { $('expenseError').textContent = 'Укажите сумму больше нуля'; return; }
    if (!isDateKey(date)) { $('expenseError').textContent = 'Выберите дату'; return; }
    if (!state.settings.categories.some(category => category.id === selectedCategoryId)) return showToast('Выбери категорию');

    const previousExpenses = state.expenses.map(expense => ({ ...expense }));
    const previousMonth = selectedMonth;
    const previousDay = overviewDay;
    const previousUpdatedAt = state.meta.updatedAt;
    const id = $('expenseId').value;
    const existing = id ? state.expenses.find(item => item.id === id) : null;
    if (existing?.mandatoryPaymentId && state.expenses.some(item => item.id !== existing.id && item.mandatoryPaymentId === existing.mandatoryPaymentId && item.date.slice(0, 7) === date.slice(0, 7))) {
      $('expenseError').textContent = 'Этот регулярный платеж уже есть в выбранном месяце.';
      return;
    }
    if (existing && moneyCents(amount) < moneyCents(paidAmount(existing))) {
      $('expenseError').textContent = 'Сумма плана меньше уже внесённой. Сначала отмени нужные оплаты в истории.';
      return;
    }
    const timestamp = new Date().toISOString();
    if (existing) {
      const wasPaid = existing.status === 'paid';
      existing.payments = expensePayments(existing).map(item => ({ ...item }));
      Object.assign(existing, {
        title,
        amount,
        date,
        categoryId: selectedCategoryId,
        status: $('expensePaid').checked ? 'paid' : 'planned',
        updatedAt: timestamp
      });
      if ($('expensePaid').checked) {
        const remainder = remainingAmount(existing);
        if (remainder > 0) existing.payments.push(newPlannedPayment(remainder, date));
      } else if (wasPaid) existing.payments = existing.payments.map(item => ({ ...item, voided: true, updatedAt: timestamp }));
      refreshExpenseStatus(existing);
    } else {
      state.expenses.push({
        id: makeId('expense'),
        title,
        amount,
        date,
        categoryId: selectedCategoryId,
        status: $('expensePaid').checked ? 'paid' : 'planned',
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
    selectedMonth = date.slice(0, 7);
    if (overviewDay && overviewDay !== date) overviewDay = null;
    if (!persistState()) {
      state.expenses = previousExpenses;
      state.meta.updatedAt = previousUpdatedAt;
      selectedMonth = previousMonth;
      overviewDay = previousDay;
      return;
    }
    closeExpenseDialog();
    showToast(existing ? 'Трата обновлена' : 'Трата добавлена');
  }

  function newPlannedPayment(amount, date) {
    const timestamp = new Date().toISOString();
    return { id: makeId('plannedpay'), amount: moneyCents(amount) / 100, date, createdAt: timestamp, updatedAt: timestamp, voided: false };
  }
  function completeExpense(id) {
    const expense = state.expenses.find(item => item.id === id && !item.cancelled);
    if (!expense) return;
    const previous = { ...expense, payments: expensePayments(expense).map(item => ({ ...item })) };
    const wasPaid = remainingAmount(expense) === 0;
    expense.payments = expensePayments(expense).map(item => ({ ...item }));
    const timestamp = new Date().toISOString();
    let added;
    if (wasPaid) expense.payments.forEach(item => { if (!item.voided) { item.voided = true; item.updatedAt = timestamp; } });
    else { added = newPlannedPayment(remainingAmount(expense), toDateKey(new Date())); expense.payments.push(added); }
    expense.updatedAt = timestamp;
    refreshExpenseStatus(expense);
    if (!persistState()) { Object.assign(expense, previous); return; }
    showToast(wasPaid ? 'Трата возвращена в план' : 'Отмечено как оплаченное', () => {
      const current = state.expenses.find(item => item.id === id);
      if (!current) return;
      const undoBefore = { ...current };
      const changedIds = wasPaid ? previous.payments.filter(item => !item.voided).map(item => item.id) : [added.id];
      current.payments = expensePayments(current).map(item => changedIds.includes(item.id)
        ? { ...item, voided: !wasPaid, updatedAt: new Date().toISOString() } : item);
      current.updatedAt = new Date().toISOString(); refreshExpenseStatus(current);
      if (!persistState()) Object.assign(current, undoBefore);
    });
  }

  let plannedPaymentExpenseId = '', plannedPaymentSubmitted = false;
  function openPlannedPayment(id) {
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return showToast('Трата удалена');
    plannedPaymentExpenseId = id; plannedPaymentSubmitted = false;
    $('plannedPaymentAmount').value = '';
    $('plannedPaymentDate').value = toDateKey(new Date());
    $('plannedPaymentError').textContent = '';
    renderPlannedPayment(); showSheet($('plannedPaymentDialog'));
    $('plannedPaymentTitle').focus({ preventScroll: true });
  }
  function renderPlannedPayment() {
    const expense = state.expenses.find(item => item.id === plannedPaymentExpenseId);
    if (!expense) return;
    const remaining = expense.cancelled ? 0 : remainingAmount(expense);
    $('plannedPaymentSubtitle').textContent = `${expense.title} · ${monthLabel(expense.date.slice(0, 7))}`;
    $('plannedPaymentRemaining').textContent = expense.cancelled ? 'Трата отменена' : paidAmount(expense) > expense.amount ? `Внесено сверх плана ${formatMoney(paidAmount(expense) - expense.amount)}. Проверь историю оплат.` : `Осталось ${formatMoney(remaining)}`;
    $('plannedPaymentAmount').max = String(remaining);
    $('plannedPaymentEntry').classList.toggle('hidden', remaining === 0);
    $('plannedPaymentSubmit').classList.toggle('hidden', remaining === 0);
    $('plannedPaymentSubmit').disabled = plannedPaymentSubmitted;
    const entered = Number($('plannedPaymentAmount').value.replace(',', '.'));
    $('plannedPaymentAfter').textContent = entered > 0 && entered <= remaining ? `После внесения останется ${formatMoney(Math.max(0, moneyCents(remaining) - moneyCents(entered)) / 100)}` : '';
    $('plannedPaymentHistory').innerHTML = expensePayments(expense).slice().sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(payment =>
      `<div class="planned-history-payment"><span><strong class="nums">${escapeHtml(formatMoney(payment.amount))}</strong><small>${escapeHtml(formatDate(payment.date))} · ${payment.voided ? 'Отменена' : 'Учтена'}</small></span><button type="button" class="textbtn" data-${payment.voided ? 'restore' : 'void'}-payment="${escapeAttr(payment.id)}">${payment.voided ? 'Восстановить' : 'Отменить'}</button></div>`
    ).join('') || '<p class="note">Внесений пока нет.</p>';
  }
  function savePlannedPayment(event) {
    event.preventDefault();
    if (plannedPaymentSubmitted || !$('plannedPaymentDialog').open) return;
    const expense = state.expenses.find(item => item.id === plannedPaymentExpenseId && !item.cancelled);
    const raw = $('plannedPaymentAmount').value.trim().replace(',', '.');
    const amount = Number(raw), date = $('plannedPaymentDate').value;
    if (!expense || !Number.isFinite(amount) || amount <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(raw)
      || moneyCents(amount) > moneyCents(remainingAmount(expense)) || !isDateKey(date)) {
      $('plannedPaymentError').textContent = 'Укажи сумму больше нуля, не выше остатка, и корректную дату.';
      return;
    }
    const before = { ...expense };
    const payment = newPlannedPayment(amount, date);
    expense.payments = [...expensePayments(expense), payment]; expense.updatedAt = payment.updatedAt; refreshExpenseStatus(expense);
    plannedPaymentSubmitted = true;
    if (!persistState()) { Object.assign(expense, before); plannedPaymentSubmitted = false; $('plannedPaymentError').textContent = 'Не удалось сохранить оплату. Попробуй ещё раз.'; return; }
    closeSheet($('plannedPaymentDialog'));
    showToast(`Учтено ${formatMoney(amount)}`);
  }
  function changePlannedPayment(id, restore) {
    const expense = state.expenses.find(item => item.id === plannedPaymentExpenseId);
    const payment = expense && expensePayments(expense).find(item => item.id === id);
    if (!payment || payment.voided === !restore) return;
    if (restore && (expense.cancelled || moneyCents(payment.amount) > moneyCents(remainingAmount(expense)))) {
      $('plannedPaymentError').textContent = 'Сначала восстанови трату или освободи остаток: эта оплата превышает остаток плана.'; return;
    }
    const before = { ...expense }, timestamp = new Date().toISOString();
    expense.payments = expensePayments(expense).map(item => item.id === id ? { ...item, voided: !restore, updatedAt: timestamp } : item);
    expense.updatedAt = timestamp; refreshExpenseStatus(expense);
    if (!persistState()) { Object.assign(expense, before); return; }
    $('plannedPaymentError').textContent = ''; showToast(restore ? 'Оплата восстановлена' : 'Оплата отменена');
  }
  function renderPlannedHistory() {
    $('plannedHistoryPeriod').textContent = monthLabel(selectedMonth);
    const expenses = state.expenses.filter(item => item.date.startsWith(selectedMonth)).slice().sort((a,b) => b.date.localeCompare(a.date));
    $('plannedHistoryList').innerHTML = expenses.map(expense => {
      const paid = paidAmount(expense), remaining = remainingAmount(expense);
      return `<article class="planned-history-item"><div><strong>${escapeHtml(expense.title)}</strong><strong class="nums">${escapeHtml(formatMoney(expense.amount))}</strong></div><p>${escapeHtml(formatDate(expense.date))} · ${expense.cancelled ? 'Отменена' : remaining === 0 ? 'Оплачена' : paid > 0 ? 'Частично оплачена' : 'В плане'}</p><p>Внесено ${escapeHtml(formatMoney(paid))} · Осталось ${escapeHtml(formatMoney(remaining))}</p><div class="planned-history-actions">
      ${expense.cancelled ? `<button type="button" class="textbtn" data-history-payments="${escapeAttr(expense.id)}">Оплаты</button><button type="button" class="textbtn" data-restore-plan="${escapeAttr(expense.id)}">Восстановить</button>` : `<button type="button" class="textbtn" data-history-payments="${escapeAttr(expense.id)}">Оплаты</button>${paid > 0 ? `<button type="button" class="textbtn" data-return-plan="${escapeAttr(expense.id)}">Вернуть в план</button>` : ''}<button type="button" class="textbtn" data-cancel-plan="${escapeAttr(expense.id)}">Отменить трату</button>`}
      </div></article>`;
    }).join('') || '<p class="note">За этот месяц запланированных трат пока нет.</p>';
  }
  function changePlannedExpense(id, action) {
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    if (action === 'payments') return openPlannedPayment(id);
    if (action === 'return') {
      if (!window.confirm('Отменить все внесения и вернуть полную сумму в план? История оплат сохранится.')) return;
      const before = { ...expense }, timestamp = new Date().toISOString();
      expense.payments = expensePayments(expense).map(item => ({ ...item, voided: true, updatedAt: item.voided ? item.updatedAt : timestamp }));
      expense.updatedAt = timestamp; refreshExpenseStatus(expense);
      if (!persistState()) Object.assign(expense, before);
      else showToast('Трата возвращена в план');
      return;
    }
    if (action === 'cancel' && !window.confirm('Отменить оставшуюся часть плана? Уже внесённые оплаты сохранятся в истории и аналитике.')) return;
    const before = { ...expense };
    expense.cancelled = action === 'cancel'; expense.updatedAt = new Date().toISOString();
    if (!persistState()) Object.assign(expense, before);
    else showToast(expense.cancelled ? 'Трата отменена' : 'Трата восстановлена');
  }

  function deleteExpense() {
    const id = $('expenseId').value, expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    const before = state.expenses;
    state.expenses = state.expenses.filter(item => item.id !== id);
    if (!persistState()) { state.expenses = before; return; }
    closeExpenseDialog();
    showToast('Трата удалена', () => {
      if (state.expenses.some(item => item.id === id)) return;
      const restored = { ...expense, updatedAt: new Date().toISOString() };
      state.expenses.push(restored);
      if (!persistState()) state.expenses = state.expenses.filter(item => item.id !== id);
    });
  }

  function saveBudget(event) {
    event?.preventDefault();
    const amount = Number($('budgetInput').value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e15) return showToast('Укажите корректный планируемый бюджет');
    const previous = { ...state.settings, budgets: { ...state.settings.budgets } };
    state.settings.budgets[selectedMonth] = amount;
    if ($('defaultBudgetToggle').checked) state.settings.defaultBudget = amount;
    if (!persistState()) { state.settings = previous; return; }
    $('defaultBudgetToggle').checked = false;
    closeSheet($('budgetDialog'));
    showToast('Планируемый бюджет сохранен');
  }

  function updateCategoryEmojiChoices() {
    const current=$('categoryEmoji').value.trim();
    qsa('[data-category-emoji]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.categoryEmoji===current));
    });
  }

  function openCategoryDialog() {
    $('categoryForm').reset();
    $('categoryEmoji').value='✨';
    updateCategoryEmojiChoices();
    showSheet($('categoryDialog'));
    setTimeout(() => $('categoryName').focus(), 80);
  }

  function saveCategory(event) {
    event.preventDefault();
    const name = $('categoryName').value.trim();
    const rawEmoji = $('categoryEmoji').value.trim();
    if (!name) return showToast('Укажи название категории');
    if (!rawEmoji) return showToast('Выбери эмодзи');
    if (state.settings.categories.some(item=>item.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))) return showToast('Такая категория уже существует');
    // Store one full grapheme cluster: emojis containing modifiers and ZWJ must not be cut.
    const emoji = typeof Intl.Segmenter==='function'
      ? new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(rawEmoji)[Symbol.iterator]().next().value.segment
      : rawEmoji;
    const index = state.settings.categories.length;
    const category = {
      id: makeId('cat'),
      name: name.slice(0, 28),
      emoji: emoji.slice(0, 32),
      color: PALETTE[index % PALETTE.length],
      soft: SOFT_PALETTE[index % SOFT_PALETTE.length],
      enabled: true
    };
    const previousCategoryId=selectedCategoryId;
    state.settings.categories.push(category);
    selectedCategoryId = category.id;
    if(!persistState()){
      state.settings.categories=state.settings.categories.filter(item=>item.id!==category.id);
      selectedCategoryId=previousCategoryId;
      return;
    }
    closeSheet($('categoryDialog'));
    if ($('unplannedDialog').open) {
      populateUnplannedCategoryOptions();
      $('unplannedCategory').value = category.id;
    }
    showToast('Категория добавлена');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pulse-backup-${toDateKey(new Date())}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('Резервная копия создана');
  }

  async function importData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const normalized = normalizeState(imported);
      if (!window.confirm('Заменить текущие данные содержимым резервной копии?')) return;
      state = normalized;
      persistState();
      showToast('Данные восстановлены');
    } catch (error) {
      console.error(error);
      showToast('Не удалось прочитать резервную копию');
    } finally {
      $('importFile').value = '';
    }
  }

  const closingSheets = new WeakMap();

  function showSheet(dialog) {
    const closing = closingSheets.get(dialog);
    if (closing) { closingSheets.delete(dialog); closing.cancel(); }
    dialog.inert = false;
    if (!dialog.open) dialog.showModal();
  }

  function closeSheet(dialog) {
    if (!dialog?.open || closingSheets.has(dialog)) return;
    if (!dialog.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
    const motion = dialog.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(20px)' }], { duration: 160, easing: 'cubic-bezier(.4,0,1,1)' });
    closingSheets.set(dialog, motion);
    dialog.inert = true;
    const finish = () => { if (closingSheets.get(dialog) !== motion) return; closingSheets.delete(dialog); dialog.close(); dialog.inert = false; };
    motion.finished.then(finish, finish);
  }

  function withCloudTimeout(operation, milliseconds = 15000) {
    let timer;
    return Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Cloud request timed out'), { code: 'cloud_timeout' })), milliseconds);
    })]).finally(() => clearTimeout(timer));
  }

  async function cloudFetch(input, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 12000);
    try { return await window.fetch(input, { ...options, signal: controller.signal }); }
    catch (error) {
      if (controller.signal.aborted && !options.signal?.aborted) throw Object.assign(new Error('Cloud request timed out'), { code: 'cloud_timeout' });
      throw error;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }

  function humanizeCloudError(error = {}) {
    const code = String(error.code || ''), message = String(error.message || error || '').toLowerCase();
    if (code === 'cloud_timeout' || message.includes('timed out') || message.includes('timeout')) return 'Сервер не ответил вовремя. Данные сохранены на устройстве. Попробуй подключиться еще раз.';
    if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) return 'Облако отказало в доступе. Данные сохранены на устройстве. Войди в свой аккаунт повторно.';
    if (code === 'PGRST205' || code === '42P01') return 'Облачное хранилище недоступно. Данные сохранены на устройстве.';
    if (message.includes('quota') || message.includes('storage')) return 'Не удалось сохранить облачную копию на устройстве. Освободи место и повтори.';
    return 'Нет подключения к облачному серверу. Данные сохранены на устройстве. Повтори синхронизацию после восстановления связи.';
  }

  function applyRemoteState(remote) {
    // Persist first: a full device must not replace its in-memory budget with unsaved data.
    localStorage.setItem(activeCloudAccountId ? STORAGE_KEY + '-account-' + activeCloudAccountId : STORAGE_KEY, JSON.stringify(remote));
    if (activeCloudAccountId) localStorage.removeItem?.(STORAGE_KEY);
    suppressCloudPush = true;
    try { state = remote; localRevision += 1; renderAll(); }
    finally { suppressCloudPush = false; }
  }

  function setSyncState(status, text = '') {
    cloudStatus = status;
    const dot = $('syncDot');
    dot.classList.remove('online', 'syncing', 'error');
    if (status) dot.classList.add(status);
    if (text) $('lastSyncText').textContent = text;
    const busy = status === 'syncing';
    $('cloudCard')?.setAttribute?.('aria-busy', String(busy));
    $('syncNowButton').disabled = busy;
    $('syncNowButton').textContent = busy ? 'Синхронизация…' : 'Синхронизировать';
    const operation = $('cloudOperationStatus');
    if (operation) { operation.hidden = !busy; operation.textContent = text || 'Подключаемся к облаку…'; }
    const header = $('headerCloudStatus');
    if (header) header.textContent = busy ? 'Обновляем…' : status === 'online' ? 'В облаке' : 'На устройстве';
    if (currentUser) $('cloudSubtitle').textContent = busy ? 'Обновляем облачную копию' : status === 'online' ? 'Данные сохранены в облаке' : status === 'error' ? 'Нет связи с облаком. Данные на устройстве' : 'Аккаунт подключен';
  }

  function cloudAvailable() {
    return SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('__SUPABASE') && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('__SUPABASE');
  }

  async function initCloud() {
    if (cloudInitPromise) return cloudInitPromise;
    cloudInitPromise = connectCloud();
    try { await cloudInitPromise; }
    catch (error) {
      if (!currentUser) supabaseClient = null;
      setSyncState('error');
      showCloudMessage(humanizeCloudError(error), true);
      $('retryCloudButton')?.classList.remove('hidden');
    } finally { cloudInitPromise = null; }
  }

  async function connectCloud() {
    if (supabaseClient) {
      if (currentUser) await syncBidirectional();
      return;
    }
    if (!cloudAvailable()) {
      $('cloudSubtitle').textContent = 'Облако пока не настроено';
      setSyncState('error');
      return;
    }
    if (!window.supabase?.createClient) {
      throw new Error('Auth library unavailable');
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: cloudFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    const { data, error } = await withCloudTimeout(supabaseClient.auth.getSession());
    if (error) { supabaseClient = null; throw error; }
    $('retryCloudButton')?.classList.add('hidden');
    currentUser = data?.session?.user || null;
    if (currentUser) activateCloudAccount(currentUser.id);
    updateCloudUi();
    if (currentUser) {
      subscribeRealtime();
      await syncBidirectional();
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      if (currentUser) activateCloudAccount(currentUser.id);
      else deactivateCloudAccount();
      updateCloudUi();
      if (currentUser) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          // Run outside the Auth callback lock.
          setTimeout(() => { subscribeRealtime(); syncBidirectional(); }, 0);
        }
      } else {
        unsubscribeRealtime();
        setSyncState('');
      }
    });
  }

  function updateCloudUi() {
    const signedIn = Boolean(currentUser);
    $('signedOutCloud').classList.toggle('hidden', signedIn);
    $('signedInCloud').classList.toggle('hidden', !signedIn);
    if (signedIn) {
      const email = currentUser.email || 'Аккаунт';
      $('accountEmail').textContent = email;
      const initial = email.trim().charAt(0).toUpperCase() || 'В';
      $('accountAvatar').textContent = initial;
      $('profileInitial').textContent = initial;
      $('cloudSubtitle').textContent = 'Синхронизация между устройствами включена';
      setSyncState(syncInFlight ? 'syncing' : cloudStatus);
    } else {
      $('profileInitial').textContent = 'В';
      $('cloudSubtitle').textContent = cloudAvailable() ? 'Войди, чтобы синхронизировать устройства' : 'Облако пока не настроено';
      if (!syncInFlight) setSyncState(cloudAvailable() ? '' : 'error');
    }
  }

  async function signIn() {
    if (authBusy) return;
    if (!supabaseClient) await initCloud();
    if (!supabaseClient) return showCloudMessage('Облачный сервис сейчас недоступен', true);
    const email = $('cloudEmail').value.trim();
    const password = $('cloudPassword').value;
    if (!email || !$('cloudEmail').checkValidity()) return showCloudMessage('Укажи корректный email', true);
    if (password.length < 6) return showCloudMessage('Укажи пароль от 6 символов', true);
    setCloudBusy(true);
    try {
      const { error } = await withCloudTimeout(supabaseClient.auth.signInWithPassword({ email, password }));
      if (error) return showCloudMessage(humanizeAuthError(error), true);
      $('cloudPassword').value = '';
      showCloudMessage('Вход выполнен. Синхронизируем данные.');
    } catch (error) {
      showCloudMessage(humanizeAuthError(error), true);
    } finally {
      setCloudBusy(false);
    }
  }

  async function signUp() {
    if (authBusy) return;
    if (!supabaseClient) await initCloud();
    if (!supabaseClient) return showCloudMessage('Облачный сервис сейчас недоступен', true);
    const email = $('cloudEmail').value.trim();
    const password = $('cloudPassword').value;
    if (!email || !$('cloudEmail').checkValidity()) return showCloudMessage('Укажи корректный email', true);
    if (password.length < 6) return showCloudMessage('Укажи пароль от 6 символов', true);
    setCloudBusy(true);
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) return showCloudMessage(humanizeAuthError(error), true);
      $('cloudPassword').value = '';
      if (data?.session) showCloudMessage('Аккаунт создан. Облачная синхронизация включена.');
      else {
        resendAfter = Date.now() + 60000;
        showCloudMessage('Подтверди почту по ссылке из письма, затем войди с паролем. Если письмо не пришло, повторную отправку можно запросить через минуту.');
      }
    } catch (error) {
      showCloudMessage(humanizeAuthError(error), true);
    } finally {
      setCloudBusy(false);
    }
  }

  async function resendConfirmation() {
    if (authBusy) return;
    if (!supabaseClient) return showCloudMessage('Облачный сервис сейчас недоступен', true);
    const email = $('cloudEmail').value.trim();
    if (!email || !$('cloudEmail').checkValidity()) return showCloudMessage('Укажи корректный email', true);
    if (Date.now() < resendAfter) return showCloudMessage('Подожди минуту перед повторной отправкой', true);
    setCloudBusy(true);
    try {
      const { error } = await supabaseClient.auth.resend({
        type: 'signup', email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      resendAfter = Date.now() + 60000;
      showCloudMessage('Повторная отправка запрошена. Проверь почту и папку «Спам». Для подтверждённого аккаунта новое письмо не требуется.');
    } catch (error) {
      showCloudMessage(humanizeAuthError(error), true);
    } finally { setCloudBusy(false); }
  }

  async function signOut() {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      currentUser = null;
      deactivateCloudAccount();
      clearTimeout(syncTimer);
      syncTimer = null;
      pendingPush = false;
      unsubscribeRealtime();
      updateCloudUi();
      showToast('Вы вышли из облачного аккаунта');
    } catch {
      showCloudMessage('Не удалось выйти из аккаунта. Проверь подключение и повтори.', true);
    }
  }

  function setCloudBusy(busy) {
    authBusy = busy;
    $('signedOutCloud')?.setAttribute?.('aria-busy', String(busy));
    $('signInButton').disabled = busy;
    $('signUpButton').disabled = busy;
    $('resendEmailButton').disabled = busy;
    if (busy) setSyncState('syncing');
    else if (!currentUser) setSyncState('');
  }

  function humanizeAuthError(error = '') {
    const lower = (typeof error === 'string' ? error : `${error.code || ''} ${error.message || ''}`).toLowerCase();
    if (lower.includes('cloud_timeout') || lower.includes('timed out') || lower.includes('failed to fetch') || lower.includes('network')) return 'Не удалось подключиться к облачному серверу. Данные сохранены на устройстве. Попробуй еще раз.';
    if (lower.includes('email address not authorized') || lower.includes('email_address_not_authorized')) return 'Supabase не разрешает отправку на этот адрес. Нужно настроить почтовый сервис для приложения.';
    if (lower.includes('sending confirmation email') || lower.includes('smtp')) return 'Не удалось отправить письмо подтверждения. Нужно проверить почтовый сервис приложения.';
    if (lower.includes('email rate limit') || lower.includes('over_email_send_rate_limit')) return 'Лимит отправки писем исчерпан. Подожди час перед следующей попыткой.';
    if (lower.includes('invalid login credentials')) return 'Неверный email или пароль';
    if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed')) return 'Сначала подтверди email по ссылке из письма';
    if (lower.includes('user already registered')) return 'Аккаунт с таким email уже существует';
    if (lower.includes('signup_disabled')) return 'Создание аккаунтов временно отключено. Уже зарегистрированные пользователи могут войти.';
    if (lower.includes('otp_expired')) return 'Ссылка подтверждения истекла. Запроси новое письмо.';
    if (lower.includes('password')) return 'Пароль должен содержать не меньше 6 символов';
    if (lower.includes('rate')) return 'Слишком много попыток. Попробуй чуть позже';
    return 'Не удалось выполнить операцию. Проверь подключение и данные';
  }

  function showCloudMessage(message, isError = false) {
    $('cloudMessage').textContent = message;
    $('cloudMessage').style.color = isError ? '#c84658' : '#5f6d83';
  }


  const CLOUD_BASE_PREFIX = 'pulse-finance-cloud-base-';
  let cloudBaseOwner = '';
  let cloudBaseState = null;

  function cloudEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function comparableState(value) {
    if (!value) return null;
    const copy = { ...value };
    delete copy.meta;
    return copy;
  }
  function cloudStateEqual(a, b) { return cloudEqual(comparableState(a), comparableState(b)); }
  function getCloudBase(userId) {
    if (cloudBaseOwner !== userId) {
      cloudBaseOwner = userId;
      cloudBaseState = null;
      try {
        const saved = localStorage.getItem(CLOUD_BASE_PREFIX + userId);
        if (saved) cloudBaseState = normalizeState(JSON.parse(saved));
      } catch (error) { console.warn('Не удалось прочитать облачную базу', error); }
    }
    return cloudBaseState;
  }
  function rememberCloudBase(userId, snapshot) {
    if (currentUser?.id !== userId) return;
    const base = normalizeState(snapshot);
    try {
      localStorage.setItem(CLOUD_BASE_PREFIX + userId, JSON.stringify(base));
      cloudBaseOwner = userId;
      cloudBaseState = base;
    } catch (error) { console.warn('Не удалось сохранить облачную базу', error); }
  }
  function chooseCloudItem(base, local, remote, localTime, remoteTime) {
    if (cloudEqual(local, base)) return remote;
    if (cloudEqual(remote, base) || cloudEqual(local, remote)) return local;
    const localStamp = Date.parse(local?.updatedAt || localTime) || 0;
    const remoteStamp = Date.parse(remote?.updatedAt || remoteTime) || 0;
    return localStamp >= remoteStamp ? local : remote;
  }
  function mergeCloudMap(base, local, remote, localTime, remoteTime) {
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(remote || {}), ...Object.keys(local || {})]);
    const output = {};
    for (const key of keys) {
      const picked = chooseCloudItem(base?.[key], local?.[key], remote?.[key], localTime, remoteTime);
      if (picked !== undefined) output[key] = picked;
    }
    return output;
  }
  function mergeCloudList(base, local, remote, localTime, remoteTime) {
    const asMap = list => Object.fromEntries((Array.isArray(list) ? list : [])
      .filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
    return Object.values(mergeCloudMap(asMap(base), asMap(local), asMap(remote), localTime, remoteTime));
  }
  function mergeCloudStates(base, local, remote) {
    const previous = base || createInitialState();
    const localTime = local.meta?.updatedAt || '';
    const remoteTime = remote.meta?.updatedAt || '';
    return normalizeState({
      meta: { version: 1, updatedAt: new Date(Math.max(Date.parse(localTime) || 0, Date.parse(remoteTime) || 0, Date.now())).toISOString() },
      settings: {
        defaultBudget: chooseCloudItem(previous.settings?.defaultBudget, local.settings.defaultBudget, remote.settings.defaultBudget, localTime, remoteTime),
        budgets: mergeCloudMap(previous.settings?.budgets, local.settings.budgets, remote.settings.budgets, localTime, remoteTime),
        categories: mergeCloudList(previous.settings?.categories, local.settings.categories, remote.settings.categories, localTime, remoteTime)
      },
      expenses: mergeCloudList(previous.expenses, local.expenses, remote.expenses, localTime, remoteTime).map(expense => {
        const baseExpense = previous.expenses.find(item => item.id === expense.id);
        const localExpense = local.expenses.find(item => item.id === expense.id);
        const remoteExpense = remote.expenses.find(item => item.id === expense.id);
        if (!localExpense || !remoteExpense) return expense;
        const payments = mergeCloudList(baseExpense ? expensePayments(baseExpense) : [], expensePayments(localExpense), expensePayments(remoteExpense), localTime, remoteTime);
        return { ...expense, payments, cancelled: chooseCloudItem(baseExpense?.cancelled, localExpense.cancelled, remoteExpense.cancelled, localExpense.updatedAt || localTime, remoteExpense.updatedAt || remoteTime) };
      }),
      unplannedExpenses: mergeCloudList(previous.unplannedExpenses, local.unplannedExpenses, remote.unplannedExpenses, localTime, remoteTime),
      mandatoryPayments: mergeCloudList(previous.mandatoryPayments, local.mandatoryPayments, remote.mandatoryPayments, localTime, remoteTime),
      loans: mergeCloudList(previous.loans, local.loans, remote.loans, localTime, remoteTime)
    });
  }

  function scheduleCloudPush() {
    if (!currentUser || !supabaseClient) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; pushCloudState(); }, 700);
  }

  // Compare-and-swap: if another device changed the row, re-read and merge
  // independent record changes instead of silently replacing its snapshot.
  async function syncBidirectional() {
    if (!currentUser || !supabaseClient) return;
    if (syncInFlight) { pendingPush = true; return; }
    syncInFlight = true;
    const userId = currentUser.id;
    setSyncState('syncing', 'Синхронизация...');
    try {
      let finished = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (currentUser?.id !== userId) return;
        const revision = localRevision;
        const localSnapshot = JSON.parse(JSON.stringify(state));
        const { data, error } = await withCloudTimeout(supabaseClient
          .from(CLOUD_TABLE)
          .select('payload,updated_at')
          .eq('user_id', userId)
          .maybeSingle());
        if (error) throw error;
        if (currentUser?.id !== userId) return;
        if (revision !== localRevision) { pendingPush = true; return; }
        const remote = data?.payload ? normalizeState(data.payload) : null;
        const merged = remote ? mergeCloudStates(getCloudBase(userId), localSnapshot, remote) : localSnapshot;
        if (remote && cloudStateEqual(merged, remote)) {
          if (!cloudStateEqual(state, remote)) applyRemoteState(remote);
          rememberCloudBase(userId, remote);
          finished = true;
          break;
        }

        const nextTimestamp = new Date(Math.max(Date.now(), (Date.parse(data?.updated_at || 0) || 0) + 1)).toISOString();
        let response;
        if (data) {
          response = await withCloudTimeout(supabaseClient.from(CLOUD_TABLE)
            .update({ payload: merged, updated_at: nextTimestamp })
            .eq('user_id', userId)
            .eq('updated_at', data.updated_at)
            .select('payload,updated_at')
            .maybeSingle());
        } else {
          response = await withCloudTimeout(supabaseClient.from(CLOUD_TABLE)
            .insert({ user_id: userId, payload: merged, updated_at: nextTimestamp })
            .select('payload,updated_at')
            .maybeSingle());
        }
        if (currentUser?.id !== userId) return;
        if (response.error?.code === '23505' || (!response.error && !response.data)) continue;
        if (response.error) throw response.error;
        const accepted = normalizeState(response.data.payload || merged);
        if (localRevision !== revision) {
          applyRemoteState(mergeCloudStates(localSnapshot, state, accepted));
          pendingPush = true;
        } else {
          applyRemoteState(accepted);
        }
        rememberCloudBase(userId, accepted);
        finished = true;
        break;
      }
      if (!finished) throw Object.assign(new Error('Concurrent cloud edits; retry'), { code: 'cloud_conflict' });
      if (currentUser?.id !== userId) return;
      if (!pendingPush) {
        setSyncState('online', 'Синхронизировано ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
        showCloudMessage('');
      }
    } catch (error) {
      if (currentUser?.id !== userId) return;
      console.error('Cloud sync failed', error);
      setSyncState('error', 'Не удалось синхронизировать');
      showCloudMessage(humanizeCloudError(error), true);
    } finally {
      syncInFlight = false;
      if (pendingPush && currentUser?.id === userId) { pendingPush = false; scheduleCloudPush(); }
    }
  }

  async function pushCloudState() { return syncBidirectional(); }

  function subscribeRealtime() {
    if (!supabaseClient || !currentUser) return;
    unsubscribeRealtime();
    const subscribedUserId = currentUser.id;
    realtimeChannel = supabaseClient
      .channel('pulse-user-' + currentUser.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: CLOUD_TABLE,
        filter: 'user_id=eq.' + currentUser.id
      }, payload => {
        if (currentUser?.id !== subscribedUserId || !payload.new?.payload) return;
        if (syncInFlight) { pendingPush = true; return; }
        // Reconciliation preserves unsent local edits and offline deletions.
        syncBidirectional();
      })
      .subscribe(status => {
        if (currentUser?.id !== subscribedUserId) return;
        if (status === 'SUBSCRIBED') syncBidirectional();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncState('error', 'Нет связи с облаком. Попробуй синхронизировать вручную.');
      });
  }

  function unsubscribeRealtime() {
    if (supabaseClient && realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  function showToast(message, undo = null) {
    const toast = $('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    if (undo) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Отменить';
      button.addEventListener('click', () => { toast.classList.remove('show'); undo(); }); toast.append(button);
    }
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function bindVisualViewport() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty('--visible-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
      document.documentElement.classList.toggle('keyboard-open', inset > 100);
    };
    viewport.addEventListener('resize', () => {
      update();
      const field = document.activeElement;
      if (field?.matches('dialog input, dialog select')) {
        requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
      }
    });
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
  }

  function bindEvents() {
    bindVisualViewport();
    $('plannedHistoryButton').addEventListener('click', () => { renderPlannedHistory(); showSheet($('plannedHistoryDialog')); });
    $('closePlannedHistory').addEventListener('click', () => closeSheet($('plannedHistoryDialog')));
    $('closePlannedPayment').addEventListener('click', () => closeSheet($('plannedPaymentDialog')));
    $('plannedPaymentForm').addEventListener('submit', savePlannedPayment);
    $('plannedPaymentAmount').addEventListener('input', renderPlannedPayment);
    $('plannedPaymentAll').addEventListener('click', () => {
      const expense = state.expenses.find(item => item.id === plannedPaymentExpenseId && !item.cancelled);
      if (expense) { $('plannedPaymentAmount').value = remainingAmount(expense); renderPlannedPayment(); }
    });
    $('plannedPaymentHistory').addEventListener('click', event => {
      const button = event.target.closest('[data-void-payment], [data-restore-payment]');
      if (button) changePlannedPayment(button.dataset.voidPayment || button.dataset.restorePayment, button.hasAttribute('data-restore-payment'));
    });
    $('plannedHistoryList').addEventListener('click', event => {
      const button = event.target.closest('[data-history-payments], [data-cancel-plan], [data-restore-plan], [data-return-plan]');
      if (!button) return;
      if (button.hasAttribute('data-history-payments')) changePlannedExpense(button.dataset.historyPayments, 'payments');
      else if (button.hasAttribute('data-cancel-plan')) changePlannedExpense(button.dataset.cancelPlan, 'cancel');
      else if (button.hasAttribute('data-restore-plan')) changePlannedExpense(button.dataset.restorePlan, 'restore');
      else changePlannedExpense(button.dataset.returnPlan, 'return');
    });
    qsa('dialog').forEach(dialog => {
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeSheet(dialog); });
      dialog.addEventListener('submit', event => {
        if (closingSheets.has(dialog)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    });
    qsa('[data-nav]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.nav === 'plans' && button.closest('[data-screen="overview"]')) activeFilter = 'planned';
      navigate(button.dataset.nav);
      renderPlans();
    }));
    qsa('[data-open-expense]').forEach(button => button.addEventListener('click', () => openExpenseDialog()));
    qsa('[data-close-dialog]').forEach(button => button.addEventListener('click', closeExpenseDialog));
    qsa('[data-close-category]').forEach(button => button.addEventListener('click', () => closeSheet($('categoryDialog'))));

    $('overviewCalendar').addEventListener('click', event => {
      const button = event.target.closest('[data-overview-day]');
      if (!button || button.disabled) return;
      overviewDay = overviewDay === button.dataset.overviewDay ? null : button.dataset.overviewDay;
      renderOverview();
    });
    $('openMonthBuilder').addEventListener('click', openMonthBuilder);
    $('closeMonthBuilder').addEventListener('click', () => closeSheet($('monthBuilderDialog')));
    $('builderMonth').addEventListener('change', () => { $('builderError').textContent = ''; renderMonthBuilder(); });
    $('builderRows').addEventListener('input', updateBuilderSummary);
    $('monthBuilderForm').addEventListener('submit', saveMonthBuilder);

    const monthControls = [
      ['overviewPrevMonth', -1], ['overviewNextMonth', 1],
      ['plansPrevMonth', -1], ['plansNextMonth', 1],
      ['analyticsPrevMonth', -1], ['analyticsNextMonth', 1],
      ['unplannedPrevMonth', -1], ['unplannedNextMonth', 1]
    ];
    monthControls.forEach(([id, delta]) => $(id).addEventListener('click', () => setSelectedMonth(addMonths(selectedMonth, delta))));
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel', 'unplannedMonthLabel'].forEach(id => $(id).addEventListener('click', goCurrentMonth));

    qsa('[data-filter]').forEach(button => button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      renderPlans();
    }));

    qsa('[data-analytics-filter]').forEach(button => button.addEventListener('click', () => {
      analyticsFilter = button.dataset.analyticsFilter;
      qsa('[data-analytics-filter]').forEach(item => { const active = item.dataset.analyticsFilter === analyticsFilter; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
      renderAnalytics();
    }));
    $('expenseForm').addEventListener('submit', saveExpense);
    $('deleteExpenseButton').addEventListener('click', deleteExpense);
    $('budgetForm').addEventListener('submit', saveBudget);
    $('budgetInput').addEventListener('input', renderBudgetPreview);
    $('openBudgetButton').addEventListener('click', openBudgetDialog);
    $('budgetSettingsCard').addEventListener('click', openBudgetDialog);
    $('closeBudgetButton').addEventListener('click', () => closeSheet($('budgetDialog')));
    $('categoriesCard').addEventListener('click', () => showSheet($('categoriesDialog')));
    $('categoryPicker').addEventListener('change', () => { selectedCategoryId = $('categoryPicker').value; });
    $('closeCategoriesButton').addEventListener('click', () => closeSheet($('categoriesDialog')));
    $('categoriesDialog').addEventListener('click', event => {
      if (event.target !== $('categoriesDialog')) return;
      const rect = $('categoriesDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet($('categoriesDialog'));
    });
    $('addCategoryButton').addEventListener('click', openCategoryDialog);
    $('overviewCreateCategory').addEventListener('click', openCategoryDialog);
    $('plannedCreateCategory').addEventListener('click', openCategoryDialog);
    $('categoryEmoji').addEventListener('input',updateCategoryEmojiChoices);
    $('categoryEmojiPresets').addEventListener('click',event=>{
      const button=event.target.closest('[data-category-emoji]');
      if(!button)return;
      $('categoryEmoji').value=button.dataset.categoryEmoji;
      updateCategoryEmojiChoices();
    });
    $('categoryForm').addEventListener('submit', saveCategory);

    $('signedOutCloud').addEventListener('submit', event => { event.preventDefault(); signIn(); });
    $('retryCloudButton').addEventListener('click', initCloud);
    $('addLoanButton').addEventListener('click', () => openLoanDialog());
    $('closeLoanButton').addEventListener('click', () => closeSheet($('loanDialog')));
    $('loanForm').addEventListener('submit', saveLoan);
    $('loanDay').addEventListener('change', () => {
      const day = Number($('loanDay').value);
      if (!Number.isInteger(day) || day < 1 || day > 31) return;
      const [year, month] = $('loanFirstDate').value.slice(0, 7).split('-').map(Number);
      $('loanFirstDate').value = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, new Date(year, month, 0).getDate())).padStart(2, '0')}`;
    });
    $('deleteLoanButton').addEventListener('click', deleteLoan);
    $('loansDirectory').addEventListener('click', handleLoanClick);
    $('loanDialog').addEventListener('click', event => {
      if (event.target !== $('loanDialog')) return;
      const rect = $('loanDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet($('loanDialog'));
    });

    $('addMandatoryPaymentButton').addEventListener('click', () => openMandatoryPaymentDialog());
    $('closeMandatoryPaymentButton').addEventListener('click', () => closeSheet($('mandatoryPaymentDialog')));
    $('mandatoryPaymentForm').addEventListener('submit', saveMandatoryPayment);
    $('deleteMandatoryPaymentButton').addEventListener('click', deleteMandatoryPayment);
    $('mandatoryPaymentsList').addEventListener('click', handleMandatoryPaymentClick);
    $('mandatoryPaymentDialog').addEventListener('click', event => {
      if (event.target !== $('mandatoryPaymentDialog')) return;
      const rect = $('mandatoryPaymentDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet($('mandatoryPaymentDialog'));
    });

    $('signUpButton').addEventListener('click', signUp);
    $('resendEmailButton').addEventListener('click', resendConfirmation);
    $('signOutButton').addEventListener('click', signOut);
    $('syncNowButton').addEventListener('click', syncBidirectional);

    $('exportButton').addEventListener('click', exportData);
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', event => importData(event.target.files?.[0]));

    $('openUnplannedDialog').addEventListener('click', () => openUnplannedDialog());
    $('addUnplannedButton').addEventListener('click', () => openUnplannedDialog());
    $('closeUnplannedButton').addEventListener('click', () => closeSheet($('unplannedDialog')));
    $('unplannedForm').addEventListener('submit', saveUnplanned);
    $('deleteUnplannedButton').addEventListener('click', deleteUnplanned);
    $('unplannedCreateCategory').addEventListener('click', () => openCategoryDialog());
    $('unplannedList').addEventListener('click', event => {
      const row=event.target.closest('[data-edit-unplanned]');
      if(row)openUnplannedDialog(row.dataset.editUnplanned);
    });
    $('unplannedHistoryButton').addEventListener('click',()=>showSheet($('unplannedHistoryDialog')));
    $('closeUnplannedHistoryButton').addEventListener('click',()=>closeSheet($('unplannedHistoryDialog')));
    $('unplannedHistoryList').addEventListener('click',event=>{
      const row=event.target.closest('[data-edit-unplanned]');
      if(!row)return;
      closeSheet($('unplannedHistoryDialog'));
      openUnplannedDialog(row.dataset.editUnplanned);
    });
    $('unplannedHistoryDialog').addEventListener('click',event=>{
      if(event.target!==$('unplannedHistoryDialog'))return;
      const r=$('unplannedHistoryDialog').getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSheet($('unplannedHistoryDialog'));
    });
    $('unplannedFilterCategory').addEventListener('change', event => { unplannedCategoryFilter=event.target.value;renderUnplanned(); });
    $('unplannedAnalyticsGranularity').addEventListener('change', event => { unplannedGranularity=event.target.value;renderUnplannedAnalytics(); });
    $('unplannedCategoryChart').addEventListener('click', event => {
      const row=event.target.closest('[data-unplanned-detail]');
      if(!row)return;
      unplannedDetailCategory=unplannedDetailCategory===row.dataset.unplannedDetail?'':row.dataset.unplannedDetail;
      renderUnplannedAnalytics();
    });
    $('unplannedDrilldown').addEventListener('click', event => { if(event.target.closest('[data-unplanned-detail-close]')){unplannedDetailCategory='';renderUnplannedAnalytics();} });
    $('unplannedDialog').addEventListener('click', event => {
      if(event.target!==$('unplannedDialog'))return;
      const r=$('unplannedDialog').getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSheet($('unplannedDialog'));
    });
    $('budgetDialog').addEventListener('click', event => {
      if (event.target !== $('budgetDialog')) return;
      const rect = $('budgetDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet($('budgetDialog'));
    });
    $('expenseDialog').addEventListener('click', event => {
      if (event.target !== $('expenseDialog')) return;
      const rect = $('expenseDialog').getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closeExpenseDialog();
    });
    $('categoryDialog').addEventListener('click', event => {
      const rect = $('categoryDialog').getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closeSheet($('categoryDialog'));
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        renderLoans();
        if (currentUser && navigator.onLine) syncBidirectional();
      }
    });
    window.addEventListener('online', () => {
      if (currentUser) syncBidirectional();
      else initCloud();
    });
    window.addEventListener('offline', () => {
      if (currentUser) setSyncState('error', 'Офлайн. Изменения сохраняются локально');
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }

  function bootstrap() {
    bindEvents();
    renderAll();
    registerServiceWorker();
    const callback = new URLSearchParams(window.location.hash.slice(1));
    const callbackError = callback.get('error_code') || callback.get('error_description') || callback.get('error');
    if (callbackError) {
      navigate('settings');
      showCloudMessage(humanizeAuthError(callbackError), true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else if (callback.has('access_token')) navigate('settings');
    if (navigator.onLine) initCloud();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
