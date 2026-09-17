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
  let activeFilter = 'all';
  let selectedCategoryId = 'food';
  let state = loadState();
  let supabaseClient = null;
  let currentUser = null;
  let syncTimer = null;
  let realtimeChannel = null;
  let syncInFlight = false;
  let suppressCloudPush = false;
  let toastTimer = null;

  const $ = id => document.getElementById(id);
  const qsa = selector => Array.from(document.querySelectorAll(selector));

  function makeId(prefix = 'id') {
    if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createInitialState() {
    return {
      meta: {
        version: 1,
        updatedAt: new Date().toISOString()
      },
      settings: {
        defaultBudget: 120000,
        budgets: {},
        categories: defaultCategories.map(item => ({ ...item }))
      },
      expenses: []
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
          emoji: String(item.emoji || '•').slice(0, 4),
          color: item.color || PALETTE[index % PALETTE.length],
          soft: item.soft || SOFT_PALETTE[index % SOFT_PALETTE.length],
          enabled: item.enabled !== false
        }))
      : fresh.settings.categories;

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
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString()
          }))
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
      expenses
    };
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
    state.meta.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    if (push && !suppressCloudPush) scheduleCloudPush();
  }

  function toMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function isDateKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
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
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount)} ₽`;
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
      .filter(expense => expense.date.startsWith(monthKey))
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
    renderAll();
  }

  function goCurrentMonth() {
    setSelectedMonth(toMonthKey(new Date()));
  }

  function navigate(screenName) {
    qsa('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === screenName));
    qsa('.bottom-nav [data-nav]').forEach(button => {
      const active = button.dataset.nav === screenName;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('appMain')?.focus({ preventScroll: true });
    if (screenName === 'settings') renderSettings();
  }

  function renderAll() {
    const label = monthLabel(selectedMonth);
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'].forEach(id => { if ($(id)) $(id).textContent = label; });
    renderOverview();
    renderPlans();
    renderAnalytics();
    renderSettings();
    renderCategoryPicker();
    updateCloudUi();
  }

  function renderOverview() {
    const monthlyExpenses = expensesForMonth();
    const planned = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const budget = budgetForMonth();
    const available = budget - planned;

    $('availableAmount').textContent = formatMoney(available);
    $('budgetAmount').textContent = formatMoney(budget);
    $('plannedAmount').textContent = formatMoney(planned);
    const percent = budget > 0 ? Math.min(100, Math.max(0, planned / budget * 100)) : (planned > 0 ? 100 : 0);
    $('budgetMeterFill').style.width = `${percent}%`;

    const todayKey = toDateKey(new Date());
    const upcoming = monthlyExpenses
      .filter(expense => expense.status !== 'paid' && expense.date >= todayKey)
      .slice(0, 3);
    const fallback = monthlyExpenses.filter(expense => expense.status !== 'paid').slice(0, 3);
    renderExpenseList($('upcomingList'), upcoming.length ? upcoming : fallback, { limit: 3, empty: 'Добавь первую планируемую трату' });

    const card = $('budgetStatusCard');
    card.classList.remove('warning', 'danger');
    if (budget <= 0 && planned > 0) {
      card.classList.add('warning');
      $('budgetStatusTitle').textContent = 'Задай бюджет';
      $('budgetStatusText').textContent = 'Так Пульс сможет оценить запас на месяц';
    } else if (available < 0) {
      card.classList.add('danger');
      $('budgetStatusTitle').textContent = 'Планы выше бюджета';
      $('budgetStatusText').textContent = `На ${formatMoney(Math.abs(available))}`;
    } else if (budget > 0 && planned / budget >= 0.85) {
      card.classList.add('warning');
      $('budgetStatusTitle').textContent = 'Бюджет почти распределён';
      $('budgetStatusText').textContent = `Свободно ${formatMoney(available)}`;
    } else {
      $('budgetStatusTitle').textContent = 'Всё под контролем';
      $('budgetStatusText').textContent = monthlyExpenses.length ? `Свободно ${formatMoney(available)}` : 'Добавь планы на месяц';
    }
  }

  function renderPlans() {
    const monthlyExpenses = expensesForMonth();
    const total = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    $('plansTotal').textContent = formatMoney(total);
    $('plansCount').textContent = `${monthlyExpenses.length} ${expenseWord(monthlyExpenses.length)} в этом месяце`;

    const filtered = activeFilter === 'all' ? monthlyExpenses : monthlyExpenses.filter(expense => expense.status === activeFilter);
    renderExpenseList($('plansList'), filtered, { empty: activeFilter === 'paid' ? 'Оплаченных трат пока нет' : 'На этот месяц пока нет трат' });
  }

  function renderExpenseList(container, expenses, options = {}) {
    if (!container) return;
    const list = typeof options.limit === 'number' ? expenses.slice(0, options.limit) : expenses;
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><span>✦</span><strong>${escapeHtml(options.empty || 'Пока пусто')}</strong><small>Новые записи появятся здесь</small></div>`;
      return;
    }
    container.innerHTML = list.map(expense => {
      const category = categoryById(expense.categoryId);
      const paidLabel = expense.status === 'paid' ? '<span class="paid-mark">✓ Оплачено</span>' : escapeHtml(formatDate(expense.date));
      return `
        <button class="expense-row ${expense.status === 'paid' ? 'paid' : ''}" type="button" data-expense-id="${escapeAttr(expense.id)}">
          <span class="category-icon" style="background:${escapeAttr(category.soft)};color:${escapeAttr(category.color)}">${escapeHtml(category.emoji)}</span>
          <span class="expense-main"><strong>${escapeHtml(expense.title)}</strong><small>${paidLabel}</small></span>
          <b>${escapeHtml(formatMoney(expense.amount))}</b>
          <span class="row-more">⋯</span>
        </button>`;
    }).join('');

    container.querySelectorAll('[data-expense-id]').forEach(button => {
      button.addEventListener('click', () => openExpenseDialog(button.dataset.expenseId));
    });
  }

  function renderAnalytics() {
    const monthlyExpenses = expensesForMonth();
    const planned = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const paidItems = monthlyExpenses.filter(expense => expense.status === 'paid');
    const paid = paidItems.reduce((sum, expense) => sum + expense.amount, 0);
    const budget = budgetForMonth();
    $('analyticsPlanned').textContent = formatMoney(planned);
    $('analyticsPaid').textContent = formatMoney(paid);
    $('analyticsBudgetPercent').textContent = budget > 0 ? `${Math.round(planned / budget * 100)}% бюджета` : 'Бюджет не задан';
    $('analyticsPaidCount').textContent = `${paidItems.length} ${expenseWord(paidItems.length)}`;
    $('donutTotal').textContent = formatMoney(planned, true);

    const totals = new Map();
    monthlyExpenses.forEach(expense => totals.set(expense.categoryId, (totals.get(expense.categoryId) || 0) + expense.amount));
    const rows = Array.from(totals.entries())
      .map(([categoryId, amount]) => ({ category: categoryById(categoryId), amount }))
      .sort((a, b) => b.amount - a.amount);

    if (!rows.length || planned <= 0) {
      $('categoryDonut').style.setProperty('--segments', 'conic-gradient(#e6ecf3 0 100%)');
      $('categoryBreakdown').innerHTML = '<div class="empty-state"><strong>Нет данных для диаграммы</strong><small>Добавь траты на выбранный месяц</small></div>';
    } else {
      let cursor = 0;
      const segments = rows.map(row => {
        const start = cursor;
        cursor += row.amount / planned * 100;
        return `${row.category.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      });
      $('categoryDonut').style.setProperty('--segments', `conic-gradient(${segments.join(',')})`);
      $('categoryBreakdown').innerHTML = rows.map(row => {
        const percent = Math.round(row.amount / planned * 100);
        return `
          <div class="breakdown-row">
            <span class="dot" style="background:${escapeAttr(row.category.color)}"></span>
            <span class="breakdown-main">
              <span><b>${escapeHtml(row.category.name)}</b><small>${percent}%</small></span>
              <i><b style="width:${percent}%;background:${escapeAttr(row.category.color)}"></b></i>
            </span>
            <b>${escapeHtml(formatMoney(row.amount))}</b>
          </div>`;
      }).join('');
    }

    const weekly = [0, 0, 0, 0, 0];
    monthlyExpenses.forEach(expense => {
      const day = Number(expense.date.slice(8, 10));
      const week = Math.min(4, Math.floor((day - 1) / 7));
      weekly[week] += expense.amount;
    });
    const max = Math.max(...weekly, 1);
    $('weekChart').innerHTML = weekly.map((amount, index) => `
      <div class="week-bar">
        <strong>${amount ? escapeHtml(formatMoney(amount, true)) : '0 ₽'}</strong>
        <i style="height:${Math.max(8, amount / max * 105)}px"></i>
        <span>${index + 1} нед.</span>
      </div>`).join('');
  }

  function renderSettings() {
    const directBudget = state.settings.budgets[selectedMonth];
    $('budgetInput').value = directBudget ?? state.settings.defaultBudget ?? 0;
    $('defaultBudgetToggle').checked = false;
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
    const enabled = state.settings.categories.filter(category => category.enabled !== false);
    if (!enabled.some(category => category.id === selectedCategoryId)) selectedCategoryId = enabled[0]?.id || state.settings.categories[0]?.id;
    $('categoryPicker').innerHTML = enabled.map(category => `
      <button class="category-choice ${category.id === selectedCategoryId ? 'active' : ''}" type="button" role="radio" aria-checked="${category.id === selectedCategoryId}" data-category-id="${escapeAttr(category.id)}">
        <span>${escapeHtml(category.emoji)}</span>
        <small>${escapeHtml(category.name)}</small>
      </button>`).join('');

    $('categoryPicker').querySelectorAll('[data-category-id]').forEach(button => {
      button.addEventListener('click', () => {
        selectedCategoryId = button.dataset.categoryId;
        renderCategoryPicker();
      });
    });
  }

  function openExpenseDialog(expenseId = null) {
    const dialog = $('expenseDialog');
    const expense = expenseId ? state.expenses.find(item => item.id === expenseId) : null;
    $('expenseForm').reset();
    $('expenseId').value = expense?.id || '';
    $('expenseDialogEyebrow').textContent = expense ? 'Редактирование' : 'Новая запись';
    $('expenseDialogTitle').textContent = expense ? 'Изменить трату' : 'Добавить трату';
    $('saveExpenseButton').textContent = expense ? 'Сохранить изменения' : 'Сохранить трату';
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
      selectedCategoryId = first?.id || state.settings.categories[0]?.id || 'other';
    }
    renderCategoryPicker();
    dialog.showModal();
    setTimeout(() => $('expenseTitle').focus(), 80);
  }

  function closeExpenseDialog() {
    if ($('expenseDialog').open) $('expenseDialog').close();
  }

  function saveExpense(event) {
    event.preventDefault();
    const title = $('expenseTitle').value.trim();
    const amount = Number($('expenseAmount').value);
    const date = $('expenseDate').value;
    if (!title) return showToast('Укажи название траты');
    if (!Number.isFinite(amount) || amount <= 0) return showToast('Укажи сумму больше нуля');
    if (!isDateKey(date)) return showToast('Выбери дату');
    if (!state.settings.categories.some(category => category.id === selectedCategoryId)) return showToast('Выбери категорию');

    const id = $('expenseId').value;
    const existing = id ? state.expenses.find(item => item.id === id) : null;
    const timestamp = new Date().toISOString();
    if (existing) {
      Object.assign(existing, {
        title,
        amount,
        date,
        categoryId: selectedCategoryId,
        status: $('expensePaid').checked ? 'paid' : 'planned',
        updatedAt: timestamp
      });
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
    persistState();
    closeExpenseDialog();
    showToast(existing ? 'Трата обновлена' : 'Трата добавлена');
  }

  function deleteExpense() {
    const id = $('expenseId').value;
    if (!id) return;
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    if (!window.confirm(`Удалить «${expense.title}»?`)) return;
    state.expenses = state.expenses.filter(item => item.id !== id);
    persistState();
    closeExpenseDialog();
    showToast('Трата удалена');
  }

  function saveBudget() {
    const amount = Number($('budgetInput').value);
    if (!Number.isFinite(amount) || amount < 0) return showToast('Укажи корректный бюджет');
    state.settings.budgets[selectedMonth] = amount;
    if ($('defaultBudgetToggle').checked) state.settings.defaultBudget = amount;
    persistState();
    $('defaultBudgetToggle').checked = false;
    showToast(`Бюджет на ${monthLabel(selectedMonth).toLowerCase()} сохранён`);
  }

  function openCategoryDialog() {
    $('categoryForm').reset();
    $('categoryDialog').showModal();
    setTimeout(() => $('categoryName').focus(), 80);
  }

  function saveCategory(event) {
    event.preventDefault();
    const name = $('categoryName').value.trim();
    const emoji = $('categoryEmoji').value.trim();
    if (!name) return showToast('Укажи название категории');
    if (!emoji) return showToast('Добавь короткий значок или эмодзи');
    const index = state.settings.categories.length;
    const category = {
      id: makeId('cat'),
      name: name.slice(0, 28),
      emoji: emoji.slice(0, 4),
      color: PALETTE[index % PALETTE.length],
      soft: SOFT_PALETTE[index % SOFT_PALETTE.length],
      enabled: true
    };
    state.settings.categories.push(category);
    selectedCategoryId = category.id;
    persistState();
    $('categoryDialog').close();
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

  function setSyncState(status, text = '') {
    const dot = $('syncDot');
    dot.classList.remove('online', 'syncing', 'error');
    if (status) dot.classList.add(status);
    if (text) $('lastSyncText').textContent = text;
  }

  function cloudAvailable() {
    return SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('__SUPABASE') && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('__SUPABASE');
  }

  async function initCloud() {
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
      $('cloudSubtitle').textContent = 'Облако недоступно без сети';
      setSyncState('error');
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) console.warn('Ошибка сессии Supabase', error);
    currentUser = data?.session?.user || null;
    updateCloudUi();
    if (currentUser) {
      subscribeRealtime();
      await syncBidirectional();
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      currentUser = session?.user || null;
      updateCloudUi();
      if (currentUser) {
        subscribeRealtime();
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') await syncBidirectional();
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
      setSyncState(syncInFlight ? 'syncing' : 'online');
    } else {
      $('profileInitial').textContent = 'В';
      $('cloudSubtitle').textContent = cloudAvailable() ? 'Войди, чтобы синхронизировать устройства' : 'Облако пока не настроено';
      if (!syncInFlight) setSyncState(cloudAvailable() ? '' : 'error');
    }
  }

  async function signIn() {
    if (!supabaseClient) return showCloudMessage('Облачный сервис сейчас недоступен', true);
    const email = $('cloudEmail').value.trim();
    const password = $('cloudPassword').value;
    if (!email || password.length < 6) return showCloudMessage('Укажи email и пароль от 6 символов', true);
    setCloudBusy(true);
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    setCloudBusy(false);
    if (error) return showCloudMessage(humanizeAuthError(error.message), true);
    $('cloudPassword').value = '';
    showCloudMessage('Вход выполнен. Синхронизируем данные.');
  }

  async function signUp() {
    if (!supabaseClient) return showCloudMessage('Облачный сервис сейчас недоступен', true);
    const email = $('cloudEmail').value.trim();
    const password = $('cloudPassword').value;
    if (!email || password.length < 6) return showCloudMessage('Укажи email и пароль от 6 символов', true);
    setCloudBusy(true);
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
    setCloudBusy(false);
    if (error) return showCloudMessage(humanizeAuthError(error.message), true);
    $('cloudPassword').value = '';
    if (data?.session) showCloudMessage('Аккаунт создан. Облачная синхронизация включена.');
    else showCloudMessage('Аккаунт создан. Подтверди email по ссылке из письма.');
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    unsubscribeRealtime();
    updateCloudUi();
    showToast('Вы вышли из облачного аккаунта');
  }

  function setCloudBusy(busy) {
    $('signInButton').disabled = busy;
    $('signUpButton').disabled = busy;
    if (busy) setSyncState('syncing');
  }

  function humanizeAuthError(message = '') {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'Неверный email или пароль';
    if (lower.includes('email not confirmed')) return 'Сначала подтверди email по ссылке из письма';
    if (lower.includes('user already registered')) return 'Аккаунт с таким email уже существует';
    if (lower.includes('password')) return 'Пароль должен содержать не меньше 6 символов';
    if (lower.includes('rate')) return 'Слишком много попыток. Попробуй чуть позже';
    return 'Не удалось выполнить операцию. Проверь подключение и данные';
  }

  function showCloudMessage(message, isError = false) {
    $('cloudMessage').textContent = message;
    $('cloudMessage').style.color = isError ? '#c84658' : '#5f6d83';
  }

  function scheduleCloudPush() {
    if (!currentUser || !supabaseClient) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushCloudState(), 700);
  }

  async function syncBidirectional() {
    if (!currentUser || !supabaseClient || syncInFlight) return;
    syncInFlight = true;
    setSyncState('syncing', 'Синхронизация...');
    try {
      const { data, error } = await supabaseClient
        .from(CLOUD_TABLE)
        .select('payload,updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (error) throw error;

      if (!data?.payload) {
        await pushCloudState(true);
      } else {
        const remote = normalizeState(data.payload);
        const remoteTime = Date.parse(remote.meta.updatedAt || data.updated_at || 0) || 0;
        const localTime = Date.parse(state.meta.updatedAt || 0) || 0;
        if (remoteTime > localTime) {
          suppressCloudPush = true;
          state = remote;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          renderAll();
          suppressCloudPush = false;
        } else if (localTime > remoteTime) {
          await pushCloudState(true);
        }
      }
      setSyncState('online', `Синхронизировано ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
      showCloudMessage('');
    } catch (error) {
      console.error('Cloud sync failed', error);
      setSyncState('error', 'Не удалось синхронизировать');
      showCloudMessage('Облако временно недоступно. Локальные данные сохранены.', true);
    } finally {
      syncInFlight = false;
    }
  }

  async function pushCloudState(force = false) {
    if (!currentUser || !supabaseClient) return;
    if (syncInFlight && !force) return;
    if (!force) {
      syncInFlight = true;
      setSyncState('syncing', 'Сохраняем в облако...');
    }
    try {
      const { error } = await supabaseClient
        .from(CLOUD_TABLE)
        .upsert({
          user_id: currentUser.id,
          payload: state,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (error) throw error;
      setSyncState('online', `Синхронизировано ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) {
      console.error('Cloud push failed', error);
      setSyncState('error', 'Локально сохранено, облако недоступно');
    } finally {
      if (!force) syncInFlight = false;
    }
  }

  function subscribeRealtime() {
    if (!supabaseClient || !currentUser) return;
    unsubscribeRealtime();
    realtimeChannel = supabaseClient
      .channel(`pulse-user-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: CLOUD_TABLE,
        filter: `user_id=eq.${currentUser.id}`
      }, payload => {
        const remotePayload = payload.new?.payload;
        if (!remotePayload) return;
        const remote = normalizeState(remotePayload);
        const remoteTime = Date.parse(remote.meta.updatedAt || 0) || 0;
        const localTime = Date.parse(state.meta.updatedAt || 0) || 0;
        if (remoteTime > localTime) {
          suppressCloudPush = true;
          state = remote;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          renderAll();
          suppressCloudPush = false;
          showToast('Данные обновлены из облака');
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setSyncState('online');
      });
  }

  function unsubscribeRealtime() {
    if (supabaseClient && realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  function showToast(message) {
    const toast = $('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function bindEvents() {
    qsa('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
    qsa('[data-open-expense]').forEach(button => button.addEventListener('click', () => openExpenseDialog()));
    qsa('[data-close-dialog]').forEach(button => button.addEventListener('click', closeExpenseDialog));
    qsa('[data-close-category]').forEach(button => button.addEventListener('click', () => $('categoryDialog').close()));

    $('profileButton').addEventListener('click', () => {
      navigate('settings');
      setTimeout(() => $('cloudCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    });

    const monthControls = [
      ['overviewPrevMonth', -1], ['overviewNextMonth', 1],
      ['plansPrevMonth', -1], ['plansNextMonth', 1],
      ['analyticsPrevMonth', -1], ['analyticsNextMonth', 1]
    ];
    monthControls.forEach(([id, delta]) => $(id).addEventListener('click', () => setSelectedMonth(addMonths(selectedMonth, delta))));
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'].forEach(id => $(id).addEventListener('click', goCurrentMonth));

    qsa('[data-filter]').forEach(button => button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      qsa('[data-filter]').forEach(item => {
        const active = item.dataset.filter === activeFilter;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      renderPlans();
    }));

    $('expenseForm').addEventListener('submit', saveExpense);
    $('deleteExpenseButton').addEventListener('click', deleteExpense);
    $('saveBudgetButton').addEventListener('click', saveBudget);
    $('categorySettingsButton').addEventListener('click', () => {
      navigate('settings');
      setTimeout(() => $('categoriesCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    });
    $('addCategoryButton').addEventListener('click', openCategoryDialog);
    $('categoryForm').addEventListener('submit', saveCategory);

    $('signInButton').addEventListener('click', signIn);
    $('signUpButton').addEventListener('click', signUp);
    $('signOutButton').addEventListener('click', signOut);
    $('syncNowButton').addEventListener('click', syncBidirectional);

    $('exportButton').addEventListener('click', exportData);
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', event => importData(event.target.files?.[0]));

    $('expenseDialog').addEventListener('click', event => {
      const rect = $('expenseDialog').getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closeExpenseDialog();
    });
    $('categoryDialog').addEventListener('click', event => {
      const rect = $('categoryDialog').getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) $('categoryDialog').close();
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
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }

  function bootstrap() {
    bindEvents();
    renderAll();
    registerServiceWorker();
    if (navigator.onLine) initCloud();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
