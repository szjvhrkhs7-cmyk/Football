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
      loans: [],
      payments: [],
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

    const payments = Array.isArray(candidate.payments)
      ? candidate.payments
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            id: String(item.id || makeId('payment')),
            title: String(item.title || 'Платеж').slice(0, 60),
            amount: Math.max(0, Math.round((Number(item.amount) || 0) * 100) / 100),
            day: Math.min(31, Math.max(1, Math.trunc(Number(item.day) || 1))),
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
      expenses,
      loans: window.PulseLoans.normalize(candidate.loans),
      payments
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
    localRevision += 1;
    state.meta.updatedAt = new Date().toISOString();
    if (!saveLocalState()) return false;
    renderAll();
    if (push && !suppressCloudPush) scheduleCloudPush();
    return true;
  }

  function saveLocalState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      showToast('Не удалось сохранить данные на устройстве. Экспортируй резервную копию.');
      return false;
    }
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

  function paymentWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'платеж';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'платежа';
    return 'платежей';
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

  function plannedExpensesForOverview(expenses) {
    return expenses.filter(expense => expense.status !== 'paid');
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
    if (screenName === activeScreen) return;
    screenScroll.set(activeScreen, window.scrollY);
    activeScreen = screenName;
    qsa('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === screenName));
    qsa('.bottom-nav [data-nav]').forEach(button => {
      const active = button.dataset.nav === (screenName === 'plans' ? 'overview' : screenName);
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    window.scrollTo({ top: screenScroll.get(screenName) || 0, behavior: 'instant' });
    $('appMain')?.focus({ preventScroll: true });
    if (screenName === 'settings') renderSettings();
  }

  function renderAll() {
    const label = monthLabel(selectedMonth);
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'].forEach(id => { if ($(id)) $(id).textContent = label; });
    renderOverview();
    renderPlans();
    renderAnalytics();
    renderPayments();
    renderLoans();
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
    const paymentsTotal = state.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    $('overviewPaymentsTotal').textContent = formatMoney(paymentsTotal);
    $('overviewPaymentsMeta').textContent = state.payments.length
      ? `${state.payments.length} ${paymentWord(state.payments.length)} в месяц · отдельно от бюджета`
      : 'Платежей пока нет · отдельно от бюджета';
    const percent = budget > 0 ? Math.min(100, Math.max(0, planned / budget * 100)) : (planned > 0 ? 100 : 0);
    $('budgetMeterFill').style.width = `${percent}%`;

    const plannedExpenses = plannedExpensesForOverview(monthlyExpenses);
    renderExpenseList($('upcomingList'), plannedExpenses, { empty: 'Добавь первую планируемую трату' });

    const card = $('budgetStatusCard');
    card.classList.remove('warning', 'danger');
    if (budget <= 0 && planned > 0) {
      card.classList.add('warning');
      $('budgetStatusTitle').textContent = 'Задай планируемый бюджет';
      $('budgetStatusText').textContent = 'Так Пульс сможет показать остаток';
    } else if (available < 0) {
      card.classList.add('danger');
      $('budgetStatusTitle').textContent = 'Расходы выше планируемого бюджета';
      $('budgetStatusText').textContent = `На ${formatMoney(Math.abs(available))}`;
    } else if (budget > 0 && planned / budget >= 0.85) {
      card.classList.add('warning');
      $('budgetStatusTitle').textContent = 'Планируемый бюджет почти исчерпан';
      $('budgetStatusText').textContent = `Остаток ${formatMoney(available)}`;
    } else {
      $('budgetStatusTitle').textContent = 'Всё под контролем';
      $('budgetStatusText').textContent = monthlyExpenses.length ? `Остаток ${formatMoney(available)}` : 'Добавь траты';
    }
  }

  function renderPayments() {
    const total = state.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    $('paymentsTotal').textContent = formatMoney(total);
    $('paymentsCount').textContent = `${state.payments.length} ${paymentWord(state.payments.length)}`;
    const sorted = [...state.payments].sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, 'ru'));
    $('paymentsDirectory').innerHTML = sorted.length ? sorted.map(payment => `
      <article class="payment-card">
        <button class="payment-main" type="button" data-edit-payment="${escapeAttr(payment.id)}" aria-label="Изменить платеж ${escapeAttr(payment.title)}">
          <span class="payment-day" aria-hidden="true"><small>день</small><b>${payment.day}</b></span>
          <span class="payment-copy"><strong>${escapeHtml(payment.title)}</strong><small>${payment.day} числа каждого месяца</small></span>
          <span class="payment-amount">${escapeHtml(formatMoney(payment.amount))}</span>
          <span class="loan-chevron" aria-hidden="true">›</span>
        </button>
      </article>`).join('') : '<div class="empty-state"><span>◷</span><strong>Платежей пока нет</strong><small>Добавь регулярные обязательные платежи</small></div>';
  }

  function openPaymentDialog(id = null) {
    const payment = state.payments.find(item => item.id === id);
    $('paymentForm').reset();
    $('paymentError').textContent = '';
    $('paymentId').value = payment?.id || '';
    $('paymentTitle').value = payment?.title || '';
    $('paymentAmount').value = payment?.amount || '';
    $('paymentDay').value = payment?.day || '';
    $('paymentDialogTitle').textContent = payment ? 'Изменить платеж' : 'Добавить платеж';
    $('deletePaymentButton').classList.toggle('hidden', !payment);
    $('paymentDialog').showModal();
  }

  function savePayment(event) {
    event.preventDefault();
    const title = $('paymentTitle').value.trim();
    const amount = Number($('paymentAmount').value);
    const day = Number($('paymentDay').value);
    let error = '';
    if (!title) error = 'Укажи название платежа';
    else if (!Number.isFinite(amount) || amount < 0.01 || amount > 1e15) error = 'Укажи сумму платежа';
    else if (!Number.isInteger(day) || day < 1 || day > 31) error = 'Укажи день месяца от 1 до 31';
    if (error) { $('paymentError').textContent = error; return; }

    const existing = state.payments.find(item => item.id === $('paymentId').value);
    const before = state.payments.map(item => ({ ...item }));
    const payment = {
      id: existing?.id || makeId('payment'),
      title: title.slice(0, 60),
      amount: Math.round(amount * 100) / 100,
      day,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, payment);
    else state.payments.push(payment);
    if (!persistState()) {
      state.payments = before;
      $('paymentError').textContent = 'Не удалось сохранить платеж. Освободи место на устройстве и повтори.';
      return;
    }
    $('paymentDialog').close();
    showToast(existing ? 'Платеж обновлен' : 'Платеж добавлен');
  }

  function handlePaymentClick(event) {
    const edit = event.target.closest('[data-edit-payment]');
    if (edit) openPaymentDialog(edit.dataset.editPayment);
  }

  function deletePayment() {
    const payment = state.payments.find(item => item.id === $('paymentId').value);
    if (!payment || !window.confirm(`Удалить платеж «${payment.title}»?`)) return;
    const previous = state.payments;
    state.payments = state.payments.filter(item => item.id !== payment.id);
    if (!persistState()) { state.payments = previous; return; }
    $('paymentDialog').close();
    showToast('Платеж удален');
  }

  function renderLoans() {
    const totalDebt = state.loans.reduce((sum, loan) => sum + (Number(loan.balance) || 0), 0);
    const monthlyTotal = state.loans.reduce((sum, loan) => sum + (Number(loan.payment) || 0), 0);
    $('loansTotal').textContent = formatMoney(totalDebt);
    $('loansCount').textContent = String(state.loans.length);
    $('loansMonthly').textContent = formatMoney(monthlyTotal);

    $('loansDirectory').innerHTML = state.loans.length ? state.loans.map(loan => {
      const paymentDay = Number(loan.firstDate.slice(8));
      return `
        <article class="loan-card">
          <button class="loan-main" type="button" data-edit-loan="${escapeAttr(loan.id)}" aria-label="Изменить кредит ${escapeAttr(loan.title)}">
            <span class="loan-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M3 10h18M7 15h3"/></svg></span>
            <span class="loan-copy">
              <strong>${escapeHtml(loan.title)}</strong>
              <small>Платеж ${escapeHtml(formatMoney(loan.payment))} в месяц · ${paymentDay} числа</small>
            </span>
            <span class="loan-amount"><small>Задолженность</small><b>${escapeHtml(formatMoney(loan.balance))}</b></span>
            <span class="loan-chevron" aria-hidden="true">›</span>
          </button>
        </article>`;
    }).join('') : '<div class="empty-state"><span>◇</span><strong>Кредитов пока нет</strong><small>Добавь кредит, чтобы видеть общую задолженность</small></div>';
  }

  function openLoanDialog(id = null) {
    const loan = state.loans.find(item => item.id === id);
    $('loanForm').reset();
    $('loanError').textContent = '';
    $('loanId').value = loan?.id || '';
    $('loanTitle').value = loan?.title || '';
    $('loanBalance').value = loan?.balance || '';
    $('loanPayment').value = loan?.payment || '';
    $('loanFirstDate').value = loan?.firstDate || (selectedMonth === toMonthKey(new Date()) ? toDateKey(new Date()) : `${selectedMonth}-01`);
    $('loanEndDate').value = loan?.endDate || '';
    $('loanDialogTitle').textContent = loan ? 'Изменить кредит' : 'Добавить кредит';
    $('deleteLoanButton').classList.toggle('hidden', !loan);
    $('loanDialog').showModal();
  }

  function saveLoan(event) {
    event.preventDefault();
    const title = $('loanTitle').value.trim();
    const balance = Number($('loanBalance').value);
    const payment = Number($('loanPayment').value);
    const firstDate = $('loanFirstDate').value;
    const endDate = $('loanEndDate').value;
    let error = '';
    if (!title) error = 'Укажи название кредита';
    else if (!Number.isFinite(balance) || balance < 0.01 || balance > 1e15) error = 'Укажи остаток задолженности';
    else if (!Number.isFinite(payment) || payment < 0.01 || payment > 1e12) error = 'Укажи ежемесячный платеж';
    else if (!isDateKey(firstDate)) error = 'Выбери дату ближайшего платежа';
    else if (endDate && (!isDateKey(endDate) || endDate < firstDate)) error = 'Дата окончания не может быть раньше ближайшего платежа';
    if (error) { $('loanError').textContent = error; return; }

    const existing = state.loans.find(item => item.id === $('loanId').value);
    const before = state.loans.map(item => ({ ...item, paidMonths: [...(item.paidMonths || [])] }));
    const loan = {
      id: existing?.id || makeId('loan'),
      title: title.slice(0, 60),
      balance: Math.round(balance * 100) / 100,
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
    $('loanDialog').close();
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
    $('loanDialog').close();
    showToast('Кредит удалён');
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
    $('analyticsBudgetPercent').textContent = budget > 0 ? `${Math.round(planned / budget * 100)}% планируемого бюджета` : 'Планируемый бюджет не задан';
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
    if (document.activeElement !== $('budgetInput')) $('budgetInput').value = directBudget ?? state.settings.defaultBudget ?? 0;
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
    if (!persistState()) return;
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
    if (!persistState()) return;
    closeExpenseDialog();
    showToast('Трата удалена');
  }

  function saveBudget() {
    const amount = Number($('budgetInput').value);
    if (!Number.isFinite(amount) || amount < 0) return showToast('Укажи корректный планируемый бюджет');
    state.settings.budgets[selectedMonth] = amount;
    if ($('defaultBudgetToggle').checked) state.settings.defaultBudget = amount;
    persistState();
    $('defaultBudgetToggle').checked = false;
    showToast('Планируемый бюджет сохранён');
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
    cloudStatus = status;
    const dot = $('syncDot');
    dot.classList.remove('online', 'syncing', 'error');
    if (status) dot.classList.add(status);
    if (text) $('lastSyncText').textContent = text;
  }

  function cloudAvailable() {
    return SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('__SUPABASE') && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('__SUPABASE');
  }

  async function initCloud() {
    if (cloudInitPromise) return cloudInitPromise;
    cloudInitPromise = connectCloud();
    try { await cloudInitPromise; }
    catch {
      setSyncState('error');
      showCloudMessage('Не удалось подключиться к облаку. Проверь интернет и повтори подключение.', true);
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
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) { supabaseClient = null; throw error; }
    $('retryCloudButton')?.classList.add('hidden');
    currentUser = data?.session?.user || null;
    updateCloudUi();
    if (currentUser) {
      subscribeRealtime();
      await syncBidirectional();
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
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
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
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

  function scheduleCloudPush() {
    if (!currentUser || !supabaseClient) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; pushCloudState(); }, 700);
  }

  async function syncBidirectional() {
    if (!currentUser || !supabaseClient || syncInFlight) return;
    syncInFlight = true;
    const revision = localRevision;
    const userId = currentUser.id;
    setSyncState('syncing', 'Синхронизация...');
    try {
      const { data, error } = await supabaseClient
        .from(CLOUD_TABLE)
        .select('payload,updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (error) throw error;

      if (currentUser?.id !== userId) return;
      if (localRevision !== revision) { pendingPush = true; return; }
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
      if (pendingPush) { pendingPush = false; scheduleCloudPush(); }
    }
  }

  async function pushCloudState(force = false) {
    if (!currentUser || !supabaseClient) return;
    if (syncInFlight && !force) { pendingPush = true; return; }
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
      if (force) throw error;
    } finally {
      if (!force) {
        syncInFlight = false;
        if (pendingPush) { pendingPush = false; scheduleCloudPush(); }
      }
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
        if (!remotePayload || syncInFlight || pendingPush || syncTimer) return;
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
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncState('error', 'Нет связи с облаком. Попробуй синхронизировать вручную.');
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
      $('categoriesDialog').showModal();
    });
    $('openCategoriesButton').addEventListener('click', () => $('categoriesDialog').showModal());
    $('closeCategoriesButton').addEventListener('click', () => $('categoriesDialog').close());
    $('categoriesDialog').addEventListener('click', event => {
      if (event.target !== $('categoriesDialog')) return;
      const rect = $('categoriesDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('categoriesDialog').close();
    });
    $('addCategoryButton').addEventListener('click', openCategoryDialog);
    $('categoryForm').addEventListener('submit', saveCategory);

    $('signedOutCloud').addEventListener('submit', event => { event.preventDefault(); signIn(); });
    $('retryCloudButton').addEventListener('click', initCloud);
    $('addPaymentButton').addEventListener('click', () => openPaymentDialog());
    $('closePaymentButton').addEventListener('click', () => $('paymentDialog').close());
    $('paymentForm').addEventListener('submit', savePayment);
    $('deletePaymentButton').addEventListener('click', deletePayment);
    $('paymentsDirectory').addEventListener('click', handlePaymentClick);
    $('paymentDialog').addEventListener('click', event => {
      if (event.target !== $('paymentDialog')) return;
      const rect = $('paymentDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('paymentDialog').close();
    });
    $('addLoanButton').addEventListener('click', () => openLoanDialog());
    $('closeLoanButton').addEventListener('click', () => $('loanDialog').close());
    $('loanForm').addEventListener('submit', saveLoan);
    $('deleteLoanButton').addEventListener('click', deleteLoan);
    $('loansDirectory').addEventListener('click', handleLoanClick);
    $('loanDialog').addEventListener('click', event => {
      if (event.target !== $('loanDialog')) return;
      const rect = $('loanDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('loanDialog').close();
    });
    $('signUpButton').addEventListener('click', signUp);
    $('resendEmailButton').addEventListener('click', resendConfirmation);
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

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        renderPayments();
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
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
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
