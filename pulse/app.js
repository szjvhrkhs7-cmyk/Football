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
  let activeFilter = 'planned';
  let analyticsFilter = 'all';
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
    $('addExpenseButton').classList.toggle('hidden', activeScreen === 'loans' || activeScreen === 'payments');
    $('addLoanButton').classList.toggle('hidden', activeScreen !== 'loans');
    $('addMandatoryPaymentButton').classList.toggle('hidden', activeScreen !== 'payments');
  }
  function openBudgetDialog() {
    renderSettings();
    $('budgetDialog').showModal();
    $('budgetInput').focus();
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
            ...(typeof item.mandatoryPaymentId === 'string' ? { mandatoryPaymentId: item.mandatoryPaymentId } : {}),
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString()
          }))
      : [];

    const mandatoryPayments = Array.isArray(candidate.mandatoryPayments)
      ? candidate.mandatoryPayments
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            id: String(item.id || makeId('payment')),
            title: String(item.title || 'Платёж').slice(0, 60),
            amount: Math.max(0, Math.round((Number(item.amount) || 0) * 100) / 100),
            day: Math.min(31, Math.max(1, Math.trunc(Number(item.day) || 1))),
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString()
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
      mandatoryPayments,
      loans: window.PulseLoans.normalize(candidate.loans)
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
      const active = button.dataset.nav === (screenName === 'payments' ? 'plans' : screenName);
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    updateDock();
    window.scrollTo({ top: screenScroll.get(screenName) || 0, behavior: 'instant' });
    $('appMain')?.focus({ preventScroll: true });
    if (screenName === 'settings') renderSettings();
  }

  function renderAll() {
    const label = monthLabel(selectedMonth);
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'].forEach(id => {
      $(id).innerHTML = `${escapeHtml(label.split(' ')[0])}<span class="year"> ${escapeHtml(selectedMonth.slice(0, 4))}</span>`;
      $(id).setAttribute('aria-label', `${label}. Перейти к текущему месяцу`);
    });
    renderOverview(); renderPlans(); renderAnalytics(); renderMandatoryPayments(); renderLoans();
    renderSettings(); renderCategoryPicker(); updateCloudUi(); updateDock();
  }

  function renderOverview() {
    const monthlyExpenses = expensesForMonth();
    const all = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const paid = monthlyExpenses.filter(expense => expense.status === 'paid').reduce((sum, expense) => sum + expense.amount, 0);
    const budget = budgetForMonth();
    const available = budget - all;
    $('availableAmount').textContent = formatMoney(available);
    $('budgetAmount').textContent = formatMoney(budget);
    $('plannedAmount').textContent = formatMoney(all);
    $('overviewPaid').textContent = $('overviewPaidSummary').textContent = formatMoney(paid);
    $('overviewPending').textContent = formatMoney(all - paid);
    $('overviewYear').textContent = selectedMonth.slice(0, 4);
    $('mandatoryOverviewAmount').textContent = state.mandatoryPayments.length ? formatMoney(mandatoryPaymentsTotal()) : 'Добавить';
    $('budgetPaidFill').style.width = `${budget > 0 ? Math.min(100, paid / budget * 100) : 0}%`;
    $('budgetMeterFill').style.width = `${budget > 0 ? Math.min(100, (all - paid) / budget * 100) : 0}%`;
    $('budgetMeter').setAttribute('aria-label', `Оплачено ${formatMoney(paid)}, предстоит ${formatMoney(all - paid)}`);
    const pending = plannedExpensesForOverview(monthlyExpenses);
    $('overviewPlansLink').textContent = `Все ${pending.length}`;
    renderExpenseList($('upcomingList'), pending, { limit: 3, empty: 'Пока без трат' });
    const alert = $('budgetAlert');
    alert.classList.toggle('hidden', available >= 0);
    alert.textContent = available < 0 ? `План превышает бюджет на ${formatMoney(-available)}` : '';
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
    $('mandatoryPaymentDialog').showModal();
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
    $('mandatoryPaymentDialog').close();
    showToast(existing ? 'Платёж обновлён' : 'Платёж добавлен');
  }

  function deleteMandatoryPayment() {
    const payment = state.mandatoryPayments.find(item => item.id === $('mandatoryPaymentId').value);
    if (!payment || !window.confirm(`Удалить платёж «${payment.title}»?`)) return;
    const before = state.mandatoryPayments;
    state.mandatoryPayments = state.mandatoryPayments.filter(item => item.id !== payment.id);
    if (!persistState()) { state.mandatoryPayments = before; return; }
    $('mandatoryPaymentDialog').close();
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
    $('loanDialog').showModal();
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
    qsa('[data-filter]').forEach(button => {
      const active = button.dataset.filter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const monthlyExpenses = expensesForMonth();
    const filtered = activeFilter === 'all' ? monthlyExpenses : monthlyExpenses.filter(expense => expense.status === activeFilter);
    $('plansTotal').textContent = formatMoney(filtered.reduce((sum, expense) => sum + expense.amount, 0));
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
      return `<div class="expense expense-row">
        <span class="categoryicon category-icon" style="background:${escapeAttr(visual.soft)};color:${escapeAttr(visual.color)}">${visual.markup}</span>
        <button class="details" type="button" data-expense-id="${escapeAttr(expense.id)}" aria-label="Редактировать ${escapeAttr(expense.title)}"><strong>${escapeHtml(expense.title)}</strong><small>${escapeHtml(category.name)} · ${escapeHtml(formatDate(expense.date))}</small></button>
        <span class="amount nums">${escapeHtml(formatMoney(expense.amount))}</span>
        <button class="check ${paid ? 'done' : ''}" type="button" data-complete-expense="${escapeAttr(expense.id)}" aria-pressed="${paid}" aria-label="${paid ? 'Вернуть в план: ' : 'Отметить оплату: '}${escapeAttr(expense.title)}">${icon('check')}</button>
      </div>`;
    }).join('');
    container.querySelectorAll('[data-expense-id]').forEach(button => button.addEventListener('click', () => openExpenseDialog(button.dataset.expenseId)));
    container.querySelectorAll('[data-complete-expense]').forEach(button => button.addEventListener('click', () => completeExpense(button.dataset.completeExpense)));
  }

  function renderAnalytics() {
    const items = expensesForMonth().filter(expense => analyticsFilter === 'all' || expense.status === 'paid');
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

  function renderSettings() {
    if (!$('budgetDialog').open) $('budgetInput').value = budgetForMonth();
    $('settingsBudgetLabel').textContent = `${monthLabel(selectedMonth)} · ${formatMoney(budgetForMonth())}`;
    $('budgetDialogPeriod').textContent = `${monthLabel(selectedMonth)}. Сумма, которую вы выделили на траты.`;
    $('budgetDialogHint').textContent = `Все траты в плане: ${formatMoney(expensesForMonth().reduce((sum, expense) => sum + expense.amount, 0))}. Остаток = планируемый бюджет − все траты в плане.`;
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
      selectedCategoryId = first?.id || state.settings.categories[0]?.id || 'other';
    }
    renderCategoryPicker();
    dialog.showModal();
    $('expenseAmount').focus();
  }

  function closeExpenseDialog() {
    if ($('expenseDialog').open) $('expenseDialog').close();
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
    const previousUpdatedAt = state.meta.updatedAt;
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
    if (!persistState()) {
      state.expenses = previousExpenses;
      state.meta.updatedAt = previousUpdatedAt;
      selectedMonth = previousMonth;
      return;
    }
    closeExpenseDialog();
    showToast(existing ? 'Трата обновлена' : 'Трата добавлена');
  }

  function completeExpense(id) {
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    const previousStatus = expense.status, previousUpdatedAt = expense.updatedAt;
    expense.status = expense.status === 'paid' ? 'planned' : 'paid';
    const expectedUpdatedAt = expense.updatedAt = new Date().toISOString(), expectedStatus = expense.status;
    if (!persistState()) { expense.status = previousStatus; expense.updatedAt = previousUpdatedAt; return; }
    showToast(expense.status === 'paid' ? 'Отмечено как оплаченное' : 'Трата возвращена в план', () => {
      const current = state.expenses.find(item => item.id === id);
      if (!current || current.updatedAt !== expectedUpdatedAt || current.status !== expectedStatus) return showToast('Трата уже изменена');
      current.status = previousStatus;
      current.updatedAt = new Date().toISOString();
      if (!persistState()) { current.status = expectedStatus; current.updatedAt = expectedUpdatedAt; }
    });
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
    $('budgetDialog').close();
    showToast('Планируемый бюджет сохранен');
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

  function bindEvents() {
    qsa('[data-nav]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.nav === 'plans' && button.closest('[data-screen="overview"]')) activeFilter = 'planned';
      navigate(button.dataset.nav);
      renderPlans();
    }));
    qsa('[data-open-expense]').forEach(button => button.addEventListener('click', () => openExpenseDialog()));
    qsa('[data-close-dialog]').forEach(button => button.addEventListener('click', closeExpenseDialog));
    qsa('[data-close-category]').forEach(button => button.addEventListener('click', () => $('categoryDialog').close()));

    $('profileButton').addEventListener('click', () => navigate('settings'));

    const monthControls = [
      ['overviewPrevMonth', -1], ['overviewNextMonth', 1],
      ['plansPrevMonth', -1], ['plansNextMonth', 1],
      ['analyticsPrevMonth', -1], ['analyticsNextMonth', 1]
    ];
    monthControls.forEach(([id, delta]) => $(id).addEventListener('click', () => setSelectedMonth(addMonths(selectedMonth, delta))));
    ['overviewMonthLabel', 'plansMonthLabel', 'analyticsMonthLabel'].forEach(id => $(id).addEventListener('click', goCurrentMonth));

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
    $('openBudgetButton').addEventListener('click', openBudgetDialog);
    $('budgetSettingsCard').addEventListener('click', openBudgetDialog);
    $('closeBudgetButton').addEventListener('click', () => $('budgetDialog').close());
    $('categoriesCard').addEventListener('click', () => $('categoriesDialog').showModal());
    $('categoryPicker').addEventListener('change', () => { selectedCategoryId = $('categoryPicker').value; });
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
    $('addLoanButton').addEventListener('click', () => openLoanDialog());
    $('closeLoanButton').addEventListener('click', () => $('loanDialog').close());
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
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('loanDialog').close();
    });

    $('addMandatoryPaymentButton').addEventListener('click', () => openMandatoryPaymentDialog());
    $('closeMandatoryPaymentButton').addEventListener('click', () => $('mandatoryPaymentDialog').close());
    $('mandatoryPaymentForm').addEventListener('submit', saveMandatoryPayment);
    $('deleteMandatoryPaymentButton').addEventListener('click', deleteMandatoryPayment);
    $('mandatoryPaymentsList').addEventListener('click', handleMandatoryPaymentClick);
    $('mandatoryPaymentDialog').addEventListener('click', event => {
      if (event.target !== $('mandatoryPaymentDialog')) return;
      const rect = $('mandatoryPaymentDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('mandatoryPaymentDialog').close();
    });

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
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('budgetDialog').close();
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
      if (!inside) $('categoryDialog').close();
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
