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

  const EXPENSE_SECTIONS = [
    { id: 'home', name: 'Квартира' },
    { id: 'credit', name: 'Кредит' },
    { id: 'other', name: 'Остальное' }
  ];

  function expenseSectionId(expense, categories = state.settings.categories) {
    if (EXPENSE_SECTIONS.some(section => section.id === expense.sectionId)) return expense.sectionId;
    const category = categories.find(item => item.id === expense.categoryId);
    const name = String(category?.name || '').trim().toLocaleLowerCase('ru-RU');
    if (expense.categoryId === 'home' || ['квартира', 'жильё', 'жилье'].includes(name)) return 'home';
    if (expense.categoryId === 'credit' || ['кредит', 'кредиты'].includes(name)) return 'credit';
    return 'other';
  }

  const now = new Date();
  let selectedMonth = toMonthKey(now);
  let overviewDay = null;
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
    document.querySelector('.dock').hidden = activeScreen !== 'overview';
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
        defaultBudget: 0,
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
            sectionId: expenseSectionId(item, categories),
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
      unplannedExpenses: window.PulseLegacyData.normalize(Array.isArray(candidate.unplannedExpenses)
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
    if (!['overview', 'settings'].includes(screenName)) return;
    if (!qsa('.screen').some(screen => screen.dataset.screen === screenName)) return;
    screenScroll.set(activeScreen, window.scrollY);
    activeScreen = screenName;
    qsa('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === screenName));
    qsa('.bottom-nav [data-nav], #profileButton').forEach(button => {
      const active = button.dataset.nav === screenName;
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
    ['overviewMonthLabel'].forEach(id => {
      $(id).textContent = compactLabel;
      $(id).setAttribute('aria-label', `${label}. Перейти к текущему месяцу`);
    });
    $('overviewTitle').textContent = `Мой ${MONTHS[Number(selectedMonth.slice(5,7)) - 1]}`;
    renderOverview();
    renderSettings(); renderCategoryPicker(); updateCloudUi(); updateDock();
  }

  function renderOverview() {
    const monthlyExpenses = expensesForMonth();
    const plannedTotal = monthlyExpenses.reduce((sum, expense) => sum + moneyCents(expense.amount), 0);
    const budget = budgetForMonth();
    const available = (moneyCents(budget) - plannedTotal) / 100;
    $('availableAmount').textContent = formatMoney(available, true);
    $('availableAmount').setAttribute('aria-label', formatMoney(available));
    $('availableAmount').classList.toggle('long-value', formatMoney(available).length > 10);
    $('budgetAmount').textContent = formatMoney(budget, true);
    $('plannedTotalValue').textContent = formatMoney(plannedTotal / 100);
    $('budgetActionLabel').textContent = budget === 0 ? 'Задать бюджет' : '';
    $('upcomingHeading').textContent = 'Планируемые траты';
    renderExpenseList($('upcomingList'), monthlyExpenses);
    const alert = $('budgetAlert');
    alert.classList.toggle('hidden', available >= 0);
    alert.textContent = available < 0 ? `Траты превышают бюджет на ${formatMoney(-available)}` : '';
  }

  function renderExpenseList(container, expenses) {
    container.innerHTML = EXPENSE_SECTIONS.map(section => {
      const entries = expenses.filter(expense => expenseSectionId(expense) === section.id);
      const total = entries.reduce((sum, expense) => sum + moneyCents(expense.amount), 0) / 100;
      const rows = entries.map(expense => {
      const category = categoryById(expense.categoryId);
      return `<div class="expense expense-row simple-expense">
        <button class="details" type="button" data-expense-id="${escapeAttr(expense.id)}" aria-label="Редактировать ${escapeAttr(expense.title)}"><strong>${escapeHtml(expense.title)}</strong><small><span class="expense-category">${escapeHtml(category.name)} · </span>${escapeHtml(formatDate(expense.date))}</small></button>
        <span class="amount nums">${escapeHtml(formatMoney(expense.amount))}</span>
      </div>`;
      }).join('');
      return `<section class="expense-section" data-expense-section="${section.id}" aria-labelledby="section-title-${section.id}">
        <header class="expense-section-head"><span class="section-icon">${icon(section.id === 'other' ? 'grid' : section.id)}</span><h3 id="section-title-${section.id}">${section.name}</h3>
          <strong class="section-total nums" data-section-total>${escapeHtml(formatMoney(total))}</strong>
          <button class="section-add" type="button" data-add-section="${section.id}" aria-label="Добавить трату в раздел ${section.name}">${icon('plus')}</button>
        </header>
        <div class="section-expenses">${rows || '<p class="section-empty">Нет трат в этом месяце</p>'}</div>
      </section>`;
    }).join('');
    container.querySelectorAll('[data-expense-id]').forEach(button => button.addEventListener('click', () => openExpenseDialog(button.dataset.expenseId)));
    container.querySelectorAll('[data-add-section]').forEach(button => button.addEventListener('click', () => openExpenseDialog(null, button.dataset.addSection)));
  }

  function renderBudgetPreview() {
    const planned = expensesForMonth().reduce((sum, expense) => sum + moneyCents(expense.amount), 0) / 100;
    const budget = Number($('budgetInput').value);
    const committed = planned;
    $('budgetPlannedAmount').textContent = formatMoney(planned);
    $('budgetRemainingAmount').textContent = $('budgetInput').value === '' || !Number.isFinite(budget) ? '—' : formatMoney((moneyCents(budget) - moneyCents(committed)) / 100);
    $('budgetRemainingAmount').classList.toggle('negative', $('budgetInput').value !== '' && Number.isFinite(budget) && budget < committed);
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

  function openExpenseDialog(expenseId = null, sectionId = 'other') {
    const dialog = $('expenseDialog');
    const expense = expenseId ? state.expenses.find(item => item.id === expenseId) : null;
    $('expenseForm').reset();
    $('expenseId').value = expense?.id || '';
    $('expenseError').textContent = '';
    $('expenseDialogTitle').textContent = expense ? 'Редактировать трату' : 'Новая трата';
    $('saveExpenseButton').textContent = expense ? 'Сохранить изменения' : 'Добавить в план';
    $('deleteExpenseButton').classList.toggle('hidden', !expense);
    const targetSection = expense ? expenseSectionId(expense) : sectionId;
    qsa('input[name="expenseSection"]').forEach(input => { input.checked = input.value === targetSection; });

    if (expense) {
      $('expenseTitle').value = expense.title;
      $('expenseAmount').value = expense.amount;
      $('expenseDate').value = expense.date;
      selectedCategoryId = expense.categoryId;
    } else {
      const today = new Date();
      const targetDate = selectedMonth === toMonthKey(today) ? today : new Date(`${selectedMonth}-01T12:00:00`);
      $('expenseDate').value = toDateKey(targetDate);
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
    const amount = moneyCents(Number($('expenseAmount').value)) / 100;
    const date = $('expenseDate').value;
    const sectionId = document.querySelector('input[name="expenseSection"]:checked')?.value;
    if (!title) { $('expenseError').textContent = 'Укажите название траты'; return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) { $('expenseError').textContent = 'Укажите сумму больше нуля'; return; }
    if (!isDateKey(date)) { $('expenseError').textContent = 'Выберите дату'; return; }
    if (!EXPENSE_SECTIONS.some(section => section.id === sectionId)) { $('expenseError').textContent = 'Выберите раздел'; return; }
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
    const timestamp = new Date().toISOString();
    if (existing) {
      Object.assign(existing, { title, amount, date, sectionId, categoryId: selectedCategoryId, updatedAt: timestamp });
    } else {
      state.expenses.push({
        id: makeId('expense'),
        title,
        amount,
        date,
        categoryId: selectedCategoryId,
        sectionId,
        status: 'planned',
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
    let previousScale = viewport.scale || 1;
    const update = () => {
      // Normalize pinch zoom before measuring the space removed by the keyboard.
      // offsetTop is also changed by panning, so it is not a keyboard measurement.
      const visibleHeight = viewport.height * (viewport.scale || 1);
      const inset = Math.max(0, window.innerHeight - visibleHeight);
      document.documentElement.style.setProperty('--visible-height', `${visibleHeight}px`);
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
      document.documentElement.classList.toggle('keyboard-open', inset > 100);
      return inset;
    };
    viewport.addEventListener('resize', () => {
      const scale = viewport.scale || 1;
      const zooming = Math.abs(scale - previousScale) > 0.01;
      previousScale = scale;
      const inset = update();
      const field = document.activeElement;
      if (!zooming && inset > 100 && field?.matches('dialog input, dialog select')) {
        requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
      }
    });
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
  }

  function bindEvents() {
    bindVisualViewport();
    qsa('dialog').forEach(dialog => {
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeSheet(dialog); });
      dialog.addEventListener('submit', event => {
        if (closingSheets.has(dialog)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    });
    qsa('[data-nav]').forEach(button => button.addEventListener('click', () => {
      navigate(button.dataset.nav);
    }));
    qsa('[data-open-expense]').forEach(button => button.addEventListener('click', () => openExpenseDialog()));
    qsa('[data-close-dialog]').forEach(button => button.addEventListener('click', closeExpenseDialog));
    qsa('[data-close-category]').forEach(button => button.addEventListener('click', () => closeSheet($('categoryDialog'))));

    [['overviewPrevMonth', -1], ['overviewNextMonth', 1]].forEach(([id, delta]) => $(id).addEventListener('click', () => setSelectedMonth(addMonths(selectedMonth, delta))));
    $('overviewMonthLabel').addEventListener('click', goCurrentMonth);

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
    $('signUpButton').addEventListener('click', signUp);
    $('resendEmailButton').addEventListener('click', resendConfirmation);
    $('signOutButton').addEventListener('click', signOut);
    $('syncNowButton').addEventListener('click', syncBidirectional);

    $('exportButton').addEventListener('click', exportData);
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', event => importData(event.target.files?.[0]));

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
