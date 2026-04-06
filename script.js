const STORAGE_KEY = 'financeiro_corporativo_premium_v3';
const LEGACY_KEYS = ['financeiro_premium_v2', 'financeiro_dashboard_v1'];
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const byId = (id) => document.getElementById(id);

let state = loadState();
let charts = { bar: null, doughnut: null };

boot();

function boot() {
  migrateLegacyIfNeeded();
  ensureShape();
  setDefaults();
  bindTabs();
  bindForms();
  bindActions();
  generateRecurringBills(24);
  renderAll();
}

function defaultState() {
  return {
    people: [],
    incomes: [],
    bills: [],
    recurring: [],
    goals: [],
    settings: { createdAt: new Date().toISOString() }
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState();
  } catch {
    return defaultState();
  }
}

function ensureShape() {
  state.people ||= [];
  state.incomes ||= [];
  state.bills ||= [];
  state.recurring ||= [];
  state.goals ||= [];
  state.settings ||= {};
}

function migrateLegacyIfNeeded() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const old = JSON.parse(raw);
      if (!old || typeof old !== 'object') continue;
      const people = [];
      const defaultPersonId = uid();
      if ((old.incomes?.length || 0) || (old.bills?.length || 0) || (old.recurring?.length || 0)) {
        people.push({ id: defaultPersonId, name: 'Pessoa 1', color: '#57d6ff', note: 'Importado da versão anterior' });
      }
      state = {
        ...defaultState(),
        people,
        incomes: (old.incomes || []).map(i => ({
          id: i.id || uid(),
          description: i.description || 'Recebimento',
          amount: Number(i.amount || 0),
          date: i.date || `${currentMonth()}-01`,
          personId: defaultPersonId,
          category: i.category || 'Outros',
          notes: i.notes || ''
        })),
        bills: (old.bills || []).map(b => ({
          id: b.id || uid(),
          description: b.description || 'Conta',
          amount: Number(b.amount || 0),
          dueDate: b.dueDate || `${currentMonth()}-10`,
          category: b.category || 'Outros',
          personId: defaultPersonId,
          paid: !!b.paid,
          receipt: b.receipt || null,
          notes: b.notes || '',
          recurringId: b.recurringId || null,
          installmentInfo: b.installmentInfo || null,
          paymentMethod: b.paymentMethod || 'Pix'
        })),
        recurring: (old.recurring || []).map(r => ({
          id: r.id || uid(),
          description: r.description || 'Recorrente',
          amount: Number(r.amount || 0),
          day: Number(r.day || 10),
          category: r.category || 'Outros',
          personId: defaultPersonId,
          paymentMethod: r.paymentMethod || 'Pix'
        })),
        goals: (old.goals || []).map(g => ({
          id: g.id || uid(),
          month: g.month || currentMonth(),
          target: Number(g.target || 0),
          note: g.note || ''
        }))
      };
      saveState();
      break;
    } catch {}
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setDefaults() {
  byId('monthFilter').value = currentMonth();
  byId('monthLabel').textContent = `Visão de ${currentMonth()}`;
  document.querySelector('#incomeForm [name="date"]').value = today();
  document.querySelector('#billForm [name="dueDate"]').value = today();
  document.querySelector('#goalForm [name="month"]').value = currentMonth();
}

function bindTabs() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
      btn.classList.add('active');
      byId(btn.dataset.tab).classList.add('active');
      byId('pageTitle').textContent = btn.textContent;
    });
  });
}

function bindForms() {
  byId('personForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.people.unshift({
      id: uid(),
      name: String(fd.get('name')).trim(),
      color: fd.get('color') || '#57d6ff',
      note: String(fd.get('note') || '').trim()
    });
    e.target.reset();
    e.target.querySelector('[name="color"]').value = '#57d6ff';
    afterMutation();
  });

  byId('incomeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.incomes.unshift({
      id: uid(),
      description: String(fd.get('description')).trim(),
      amount: parseMoney(fd.get('amount')),
      date: fd.get('date'),
      personId: fd.get('personId'),
      category: fd.get('category') || 'Outros',
      notes: String(fd.get('notes') || '').trim()
    });
    e.target.reset();
    e.target.querySelector('[name="date"]').value = today();
    populatePersonSelects();
    afterMutation();
  });

  byId('billForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const installments = Math.max(1, parseInt(fd.get('installments') || '1', 10));
    const total = parseMoney(fd.get('amount'));
    const baseDate = fd.get('dueDate');
    const installmentValues = splitInstallments(total, installments);
    for (let i = 0; i < installments; i++) {
      const dueDate = addMonthsToDate(baseDate, i);
      state.bills.unshift({
        id: uid(),
        description: installments > 1 ? `${String(fd.get('description')).trim()} (${i + 1}/${installments})` : String(fd.get('description')).trim(),
        amount: installmentValues[i],
        dueDate,
        category: fd.get('category') || 'Outros',
        personId: fd.get('personId'),
        paid: false,
        receipt: null,
        notes: String(fd.get('notes') || '').trim(),
        recurringId: null,
        installmentInfo: installments > 1 ? { current: i + 1, total: installments, group: String(fd.get('description')).trim() } : null,
        paymentMethod: fd.get('paymentMethod') || 'Pix'
      });
    }
    e.target.reset();
    e.target.querySelector('[name="dueDate"]').value = today();
    e.target.querySelector('[name="installments"]').value = 1;
    populatePersonSelects();
    afterMutation();
  });

  byId('recurringForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.recurring.unshift({
      id: uid(),
      description: String(fd.get('description')).trim(),
      amount: parseMoney(fd.get('amount')),
      day: clampDay(fd.get('day')),
      category: fd.get('category') || 'Outros',
      personId: fd.get('personId'),
      paymentMethod: fd.get('paymentMethod') || 'Pix'
    });
    e.target.reset();
    e.target.querySelector('[name="day"]').value = 10;
    populatePersonSelects();
    afterMutation();
  });

  byId('goalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const month = fd.get('month');
    const existing = state.goals.find((g) => g.month === month);
    if (existing) {
      existing.target = parseMoney(fd.get('target'));
      existing.note = String(fd.get('note') || '').trim();
    } else {
      state.goals.unshift({
        id: uid(),
        month,
        target: parseMoney(fd.get('target')),
        note: String(fd.get('note') || '').trim()
      });
    }
    afterMutation();
  });
}

function bindActions() {
  byId('monthFilter').addEventListener('change', renderAll);
  byId('personFilter').addEventListener('change', renderAll);
  byId('incomeSearch').addEventListener('input', renderIncomes);
  byId('billSearch').addEventListener('input', renderBills);
  byId('statusFilter').addEventListener('change', renderBills);
  byId('backupBtn').addEventListener('click', downloadBackup);
  byId('restoreInput').addEventListener('change', restoreBackup);
  byId('exportCsvBtn').addEventListener('click', exportCsv);
  byId('exportPdfBtn').addEventListener('click', exportPdf);
  byId('resetAllBtn').addEventListener('click', resetAllData);
  byId('clearMonthBtn').addEventListener('click', clearCurrentMonth);
  byId('closeModalBtn').addEventListener('click', closeModal);
  byId('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const { action, type, id } = actionEl.dataset;
    if (action === 'delete') handleDelete(type, id);
    if (action === 'edit') openEdit(type, id);
    if (action === 'togglePaid') togglePaid(id);
    if (action === 'receipt') attachReceipt(id);
    if (action === 'removeReceipt') removeReceipt(id);
  });
}

function afterMutation() {
  generateRecurringBills(24);
  saveState();
  renderAll();
}

function currentFilters() {
  return {
    month: byId('monthFilter').value || currentMonth(),
    personId: byId('personFilter').value || 'all'
  };
}

function matchesPerson(item) {
  const { personId } = currentFilters();
  return personId === 'all' || item.personId === personId;
}

function monthItems() {
  const { month } = currentFilters();
  return {
    incomes: state.incomes.filter((i) => i.date.startsWith(month) && matchesPerson(i)),
    bills: state.bills.filter((b) => b.dueDate.startsWith(month) && matchesPerson(b))
  };
}

function renderAll() {
  byId('monthLabel').textContent = `Visão de ${currentFilters().month}`;
  populateFilters();
  populatePersonSelects();
  renderDashboard();
  renderPeople();
  renderIncomes();
  renderBills();
  renderRecurring();
  renderGoals();
  renderBackupSummary();
}

function populateFilters() {
  const currentPerson = byId('personFilter').value || 'all';
  byId('personFilter').innerHTML = `<option value="all">Todas</option>` + state.people.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  byId('personFilter').value = state.people.some((p) => p.id === currentPerson) ? currentPerson : 'all';
}

function populatePersonSelects() {
  const options = state.people.length
    ? state.people.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
    : '<option value="">Cadastre uma pessoa primeiro</option>';
  document.querySelectorAll('.person-select').forEach((select) => {
    const current = select.value;
    select.innerHTML = options;
    if (state.people.some((p) => p.id === current)) select.value = current;
  });
}

function renderDashboard() {
  const { incomes, bills } = monthItems();
  const totalIncome = sum(incomes, 'amount');
  const totalBills = sum(bills, 'amount');
  const totalOpen = sum(bills.filter((b) => !b.paid), 'amount');
  const totalPaid = sum(bills.filter((b) => b.paid), 'amount');
  const forecast = totalIncome - totalOpen;
  const goal = state.goals.find((g) => g.month === currentFilters().month);

  byId('metricIncome').textContent = money(totalIncome);
  byId('metricBills').textContent = money(totalBills);
  byId('metricOpen').textContent = money(totalOpen);
  byId('metricForecast').textContent = money(forecast);
  byId('metricPaid').textContent = money(totalPaid);
  byId('metricGoal').textContent = goal ? money(goal.target) : '--';
  byId('goalProgressLabel').textContent = goal ? `${forecast >= goal.target ? 'Meta atingida' : 'Meta em andamento'}` : 'Sem meta definida';

  const overdue = bills.filter((b) => !b.paid && b.dueDate < today());
  const dueToday = bills.filter((b) => !b.paid && b.dueDate === today());
  byId('overdueAlert').textContent = overdue.length ? `Você tem ${overdue.length} conta(s) vencida(s), total ${money(sum(overdue, 'amount'))}.` : 'Nenhuma conta vencida.';
  byId('todayAlert').textContent = dueToday.length ? `${dueToday.length} conta(s) vencem hoje, total ${money(sum(dueToday, 'amount'))}.` : 'Nenhuma conta vence hoje.';
  byId('goalAlert').textContent = goal
    ? `Meta do mês: ${money(goal.target)}. Previsão atual: ${money(forecast)}.${goal.note ? ` ${goal.note}` : ''}`
    : 'Sem meta definida para este mês.';

  const upcoming = bills
    .filter((b) => !b.paid && b.dueDate >= today())
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8);
  byId('upcomingBills').innerHTML = upcoming.length ? upcoming.map(renderBillSummaryCard).join('') : `<div class="empty">Nenhuma conta próxima por enquanto.</div>`;

  const summary = buildPersonSummary(incomes, bills);
  byId('personSummary').innerHTML = summary.length ? summary.map((item) => `
    <div class="item-card">
      <div class="item-head">
        <div>
          <h4>${personMarkup(item.person)}</h4>
          <p>Recebimentos: ${money(item.income)} • Contas: ${money(item.bills)}</p>
        </div>
        <div class="item-value">${money(item.forecast)}</div>
      </div>
      <div class="item-meta">
        <span class="badge open">Em aberto: ${money(item.open)}</span>
        <span class="badge paid">Pagas: ${money(item.paid)}</span>
      </div>
    </div>
  `).join('') : `<div class="empty">Cadastre pessoas e lançamentos para ver o resumo por responsável.</div>`;

  renderCharts(totalIncome, totalBills, totalOpen, totalPaid, sum(overdue, 'amount'), forecast);
}

function renderCharts(totalIncome, totalBills, totalOpen, totalPaid, overdueSum, forecast) {
  if (charts.bar) charts.bar.destroy();
  if (charts.doughnut) charts.doughnut.destroy();
  charts.bar = new Chart(byId('barChart'), {
    type: 'bar',
    data: {
      labels: ['Recebimentos', 'Contas', 'Em aberto', 'Pago', 'Previsão'],
      datasets: [{ data: [totalIncome, totalBills, totalOpen, totalPaid, forecast], borderRadius: 10 }]
    },
    options: chartOptions(false)
  });

  charts.doughnut = new Chart(byId('doughnutChart'), {
    type: 'doughnut',
    data: {
      labels: ['Pago', 'Em aberto', 'Vencido'],
      datasets: [{ data: [totalPaid, totalOpen - overdueSum, overdueSum], borderWidth: 0 }]
    },
    options: chartOptions(true)
  });
}

function chartOptions(doughnut) {
  return {
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#dce9ff' } } },
    scales: doughnut ? {} : {
      x: { ticks: { color: '#dce9ff' }, grid: { color: 'rgba(255,255,255,.06)' } },
      y: { ticks: { color: '#dce9ff' }, grid: { color: 'rgba(255,255,255,.06)' } }
    }
  };
}

function renderPeople() {
  const list = byId('peopleList');
  if (!state.people.length) {
    list.innerHTML = `<div class="empty">Nenhuma pessoa cadastrada ainda.</div>`;
    return;
  }
  list.innerHTML = state.people.map((person) => {
    const income = sum(state.incomes.filter((i) => i.personId === person.id && i.date.startsWith(currentFilters().month)), 'amount');
    const bills = sum(state.bills.filter((b) => b.personId === person.id && b.dueDate.startsWith(currentFilters().month)), 'amount');
    return `
      <div class="item-card">
        <div class="item-head">
          <div>
            <h4>${personMarkup(person)}</h4>
            <p>${escapeHtml(person.note || 'Sem observação')}</p>
          </div>
          <div class="item-value">${money(income - bills)}</div>
        </div>
        <div class="item-meta">
          <span class="tag person">Recebimentos: ${money(income)}</span>
          <span class="tag person">Contas: ${money(bills)}</span>
        </div>
        <div class="item-actions">
          <button class="mini-btn" data-action="edit" data-type="person" data-id="${person.id}" type="button">Editar</button>
          <button class="mini-btn" data-action="delete" data-type="person" data-id="${person.id}" type="button">Excluir</button>
        </div>
      </div>`;
  }).join('');
}

function renderIncomes() {
  const term = byId('incomeSearch').value.trim().toLowerCase();
  const items = monthItems().incomes
    .filter((i) => !term || [i.description, i.category, personName(i.personId), i.notes].join(' ').toLowerCase().includes(term))
    .sort((a, b) => b.date.localeCompare(a.date));
  byId('incomeList').innerHTML = items.length ? items.map((item) => `
    <div class="item-card">
      <div class="item-head">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <p>${item.date} • ${escapeHtml(item.category || 'Sem categoria')}</p>
        </div>
        <div class="item-value">${money(item.amount)}</div>
      </div>
      <div class="item-meta">
        <span class="tag person">${personMarkup(getPerson(item.personId))}</span>
        ${item.notes ? `<span class="tag">${escapeHtml(item.notes)}</span>` : ''}
      </div>
      <div class="item-actions">
        <button class="mini-btn" data-action="edit" data-type="income" data-id="${item.id}" type="button">Editar</button>
        <button class="mini-btn" data-action="delete" data-type="income" data-id="${item.id}" type="button">Excluir</button>
      </div>
    </div>
  `).join('') : `<div class="empty">Nenhum recebimento neste mês.</div>`;
}

function renderBills() {
  const term = byId('billSearch').value.trim().toLowerCase();
  const status = byId('statusFilter').value;
  const items = monthItems().bills
    .filter((b) => !term || [b.description, b.category, personName(b.personId), b.notes, b.paymentMethod].join(' ').toLowerCase().includes(term))
    .filter((b) => status === 'all' ? true : billStatusKey(b) === status)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  byId('billList').innerHTML = items.length ? items.map(renderBillCard).join('') : `<div class="empty">Nenhuma conta encontrada neste filtro.</div>`;
}

function renderBillCard(item) {
  return `
    <div class="item-card">
      <div class="item-head">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <p>${escapeHtml(item.category || 'Sem categoria')} • vence em ${item.dueDate}</p>
        </div>
        <span class="badge ${billStatusKey(item)}">${billStatusText(item)}</span>
      </div>
      <div class="item-value">${money(item.amount)}</div>
      <div class="item-meta">
        <span class="tag person">${personMarkup(getPerson(item.personId))}</span>
        <span class="tag">${escapeHtml(item.paymentMethod || 'Pix')}</span>
        ${item.installmentInfo ? `<span class="tag">Parcela ${item.installmentInfo.current}/${item.installmentInfo.total}</span>` : ''}
        ${item.notes ? `<span class="tag">${escapeHtml(item.notes)}</span>` : ''}
      </div>
      <div class="item-actions">
        <button class="mini-btn" data-action="togglePaid" data-id="${item.id}" type="button">${item.paid ? 'Desmarcar paga' : 'Marcar paga'}</button>
        <button class="mini-btn" data-action="edit" data-type="bill" data-id="${item.id}" type="button">Editar</button>
        <button class="mini-btn" data-action="receipt" data-id="${item.id}" type="button">Comprovante</button>
        ${item.receipt ? `<a class="file-link" href="${item.receipt.data}" download="${escapeAttr(item.receipt.name)}">Baixar comprovante</a>
        <button class="mini-btn" data-action="removeReceipt" data-id="${item.id}" type="button">Remover comprovante</button>` : ''}
        <button class="mini-btn" data-action="delete" data-type="bill" data-id="${item.id}" type="button">Excluir</button>
      </div>
    </div>`;
}

function renderBillSummaryCard(item) {
  return `
    <div class="item-card">
      <div class="item-head">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <p>${item.dueDate} • ${personName(item.personId)} • ${escapeHtml(item.category || 'Sem categoria')}</p>
        </div>
        <span class="badge ${billStatusKey(item)}">${billStatusText(item)}</span>
      </div>
      <div class="item-meta">
        <span class="tag">${money(item.amount)}</span>
        <span class="tag">${escapeHtml(item.paymentMethod || 'Pix')}</span>
      </div>
    </div>`;
}

function renderRecurring() {
  byId('recurringList').innerHTML = state.recurring.length ? state.recurring.map((item) => `
    <div class="item-card">
      <div class="item-head">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <p>${escapeHtml(item.category || 'Sem categoria')} • dia ${item.day} todo mês</p>
        </div>
        <div class="item-value">${money(item.amount)}</div>
      </div>
      <div class="item-meta">
        <span class="tag person">${personMarkup(getPerson(item.personId))}</span>
        <span class="tag">${escapeHtml(item.paymentMethod || 'Pix')}</span>
      </div>
      <div class="item-actions">
        <button class="mini-btn" data-action="edit" data-type="recurring" data-id="${item.id}" type="button">Editar</button>
        <button class="mini-btn" data-action="delete" data-type="recurring" data-id="${item.id}" type="button">Excluir</button>
      </div>
    </div>`).join('') : `<div class="empty">Nenhuma conta recorrente cadastrada.</div>`;
}

function renderGoals() {
  byId('goalList').innerHTML = state.goals.length ? state.goals
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((item) => {
      const forecast = calculateForecastForMonth(item.month);
      return `
      <div class="item-card">
        <div class="item-head">
          <div>
            <h4>${item.month}</h4>
            <p>${escapeHtml(item.note || 'Sem observação')}</p>
          </div>
          <div class="item-value">${money(item.target)}</div>
        </div>
        <div class="item-meta">
          <span class="badge ${forecast >= item.target ? 'paid' : 'open'}">Previsão: ${money(forecast)}</span>
        </div>
        <div class="item-actions">
          <button class="mini-btn" data-action="edit" data-type="goal" data-id="${item.id}" type="button">Editar</button>
          <button class="mini-btn" data-action="delete" data-type="goal" data-id="${item.id}" type="button">Excluir</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty">Nenhuma meta cadastrada.</div>`;
}

function renderBackupSummary() {
  byId('backupSummary').innerHTML = `
    Pessoas: <strong>${state.people.length}</strong><br>
    Recebimentos: <strong>${state.incomes.length}</strong><br>
    Contas: <strong>${state.bills.length}</strong><br>
    Recorrentes: <strong>${state.recurring.length}</strong><br>
    Metas: <strong>${state.goals.length}</strong><br>
    Filtro atual: <strong>${currentFilters().month}</strong><br>
    Responsável filtrado: <strong>${currentFilters().personId === 'all' ? 'Todas as pessoas' : escapeHtml(personName(currentFilters().personId))}</strong>
  `;
}

function handleDelete(type, id) {
  if (!confirm('Deseja excluir este item?')) return;
  if (type === 'person') {
    const usageCount = state.incomes.filter((i) => i.personId === id).length + state.bills.filter((b) => b.personId === id).length + state.recurring.filter((r) => r.personId === id).length;
    if (usageCount > 0) {
      alert('Essa pessoa está vinculada a lançamentos. Edite os lançamentos primeiro ou apague-os antes de excluir a pessoa.');
      return;
    }
    state.people = state.people.filter((p) => p.id !== id);
  }
  if (type === 'income') state.incomes = state.incomes.filter((i) => i.id !== id);
  if (type === 'bill') state.bills = state.bills.filter((b) => b.id !== id);
  if (type === 'goal') state.goals = state.goals.filter((g) => g.id !== id);
  if (type === 'recurring') {
    state.recurring = state.recurring.filter((r) => r.id !== id);
    state.bills = state.bills.filter((b) => b.recurringId !== id);
  }
  afterMutation();
}

function togglePaid(id) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;
  bill.paid = !bill.paid;
  afterMutation();
}

function attachReceipt(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bill = state.bills.find((b) => b.id === id);
      if (!bill) return;
      bill.receipt = { name: file.name, data: reader.result };
      afterMutation();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function removeReceipt(id) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;
  bill.receipt = null;
  afterMutation();
}

function openEdit(type, id) {
  const form = byId('modalForm');
  const modal = byId('modal');
  const item = getItem(type, id);
  if (!item) return;
  byId('modalTitle').textContent = `Editar ${typeLabel(type)}`;
  form.innerHTML = buildEditForm(type, item);
  const selects = form.querySelectorAll('[data-fill="people"]');
  selects.forEach((select) => {
    select.innerHTML = state.people.length ? state.people.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('') : '<option value="">Cadastre uma pessoa primeiro</option>';
    select.value = item.personId || '';
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    applyEdit(type, item, fd);
    closeModal();
    afterMutation();
  };
  modal.classList.remove('hidden');
}

function closeModal() {
  byId('modal').classList.add('hidden');
  byId('modalForm').innerHTML = '';
}

function buildEditForm(type, item) {
  if (type === 'person') {
    return `
      <label>Nome<input name="name" value="${escapeAttr(item.name)}" required></label>
      <label>Cor<input name="color" type="color" value="${escapeAttr(item.color || '#57d6ff')}"></label>
      <label>Observação<input name="note" value="${escapeAttr(item.note || '')}"></label>
      <button class="btn" type="submit">Salvar alterações</button>`;
  }
  if (type === 'income') {
    return `
      <label>Descrição<input name="description" value="${escapeAttr(item.description)}" required></label>
      <label>Valor<input name="amount" type="number" step="0.01" value="${item.amount}" required></label>
      <label>Data<input name="date" type="date" value="${item.date}" required></label>
      <label>Pessoa<select name="personId" data-fill="people"></select></label>
      <label>Categoria<input name="category" value="${escapeAttr(item.category || '')}"></label>
      <label>Observação<input name="notes" value="${escapeAttr(item.notes || '')}"></label>
      <button class="btn" type="submit">Salvar alterações</button>`;
  }
  if (type === 'bill') {
    return `
      <label>Descrição<input name="description" value="${escapeAttr(item.description)}" required></label>
      <label>Valor<input name="amount" type="number" step="0.01" value="${item.amount}" required></label>
      <label>Vencimento<input name="dueDate" type="date" value="${item.dueDate}" required></label>
      <label>Pessoa<select name="personId" data-fill="people"></select></label>
      <label>Categoria<input name="category" value="${escapeAttr(item.category || '')}"></label>
      <label>Método de pagamento<input name="paymentMethod" value="${escapeAttr(item.paymentMethod || '')}"></label>
      <label>Observação<input name="notes" value="${escapeAttr(item.notes || '')}"></label>
      <button class="btn" type="submit">Salvar alterações</button>`;
  }
  if (type === 'recurring') {
    return `
      <label>Descrição<input name="description" value="${escapeAttr(item.description)}" required></label>
      <label>Valor<input name="amount" type="number" step="0.01" value="${item.amount}" required></label>
      <label>Dia<input name="day" type="number" min="1" max="28" value="${item.day}" required></label>
      <label>Pessoa<select name="personId" data-fill="people"></select></label>
      <label>Categoria<input name="category" value="${escapeAttr(item.category || '')}"></label>
      <label>Método de pagamento<input name="paymentMethod" value="${escapeAttr(item.paymentMethod || '')}"></label>
      <button class="btn" type="submit">Salvar alterações</button>`;
  }
  return `
    <label>Mês<input name="month" type="month" value="${item.month}" required></label>
    <label>Meta<input name="target" type="number" step="0.01" value="${item.target}" required></label>
    <label>Observação<input name="note" value="${escapeAttr(item.note || '')}"></label>
    <button class="btn" type="submit">Salvar alterações</button>`;
}

function applyEdit(type, item, fd) {
  if (type === 'person') {
    item.name = String(fd.get('name')).trim();
    item.color = fd.get('color') || '#57d6ff';
    item.note = String(fd.get('note') || '').trim();
    return;
  }
  if (type === 'goal') {
    item.month = fd.get('month');
    item.target = parseMoney(fd.get('target'));
    item.note = String(fd.get('note') || '').trim();
    return;
  }
  item.description = String(fd.get('description')).trim();
  item.personId = fd.get('personId');
  item.category = String(fd.get('category') || '').trim();
  if (fd.has('amount')) item.amount = parseMoney(fd.get('amount'));
  if (fd.has('date')) item.date = fd.get('date');
  if (fd.has('dueDate')) item.dueDate = fd.get('dueDate');
  if (fd.has('notes')) item.notes = String(fd.get('notes') || '').trim();
  if (fd.has('paymentMethod')) item.paymentMethod = String(fd.get('paymentMethod') || '').trim();
  if (fd.has('day')) item.day = clampDay(fd.get('day'));
}

function getItem(type, id) {
  if (type === 'person') return state.people.find((x) => x.id === id);
  if (type === 'income') return state.incomes.find((x) => x.id === id);
  if (type === 'bill') return state.bills.find((x) => x.id === id);
  if (type === 'recurring') return state.recurring.find((x) => x.id === id);
  return state.goals.find((x) => x.id === id);
}

function typeLabel(type) {
  return ({ person: 'pessoa', income: 'recebimento', bill: 'conta', recurring: 'recorrente', goal: 'meta' })[type] || 'item';
}

function resetAllData() {
  if (!confirm('Isso vai apagar TODOS os dados deste sistema no navegador. Continuar?')) return;
  state = defaultState();
  saveState();
  renderAll();
}

function clearCurrentMonth() {
  if (!confirm('Deseja apagar apenas os lançamentos do mês filtrado?')) return;
  const month = currentFilters().month;
  state.incomes = state.incomes.filter((i) => !i.date.startsWith(month));
  state.bills = state.bills.filter((b) => !b.dueDate.startsWith(month) || b.recurringId);
  afterMutation();
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `backup-financeiro-${today()}.json`);
}

function restoreBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state = { ...defaultState(), ...data };
      ensureShape();
      saveState();
      renderAll();
      alert('Backup restaurado com sucesso.');
    } catch {
      alert('Arquivo inválido.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

function exportCsv() {
  const { incomes, bills } = monthItems();
  const rows = [['Tipo','Pessoa','Descrição','Categoria','Valor','Data','Status','Método','Observação']];
  incomes.forEach((i) => rows.push(['Recebimento', personName(i.personId), i.description, i.category || '', i.amount, i.date, 'Recebido', '', i.notes || '']));
  bills.forEach((b) => rows.push(['Conta', personName(b.personId), b.description, b.category || '', b.amount, b.dueDate, billStatusText(b), b.paymentMethod || '', b.notes || '']));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `financeiro-${currentFilters().month}.csv`);
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const { incomes, bills } = monthItems();
  let y = 18;
  doc.setFontSize(18);
  doc.text(`Financeiro Corporativo - ${currentFilters().month}`, 14, y);
  y += 10;
  doc.setFontSize(11);
  doc.text(`Filtro de pessoa: ${currentFilters().personId === 'all' ? 'Todas' : personName(currentFilters().personId)}`, 14, y);
  y += 8;
  doc.text(`Recebimentos: ${money(sum(incomes, 'amount'))}`, 14, y); y += 7;
  doc.text(`Contas: ${money(sum(bills, 'amount'))}`, 14, y); y += 7;
  doc.text(`Em aberto: ${money(sum(bills.filter((b) => !b.paid), 'amount'))}`, 14, y); y += 10;

  doc.setFontSize(13);
  doc.text('Contas do mês', 14, y); y += 8;
  doc.setFontSize(10);
  const lines = bills.slice(0, 20).map((b) => `${b.dueDate} | ${personName(b.personId)} | ${b.description} | ${money(b.amount)} | ${billStatusText(b)}`);
  if (!lines.length) lines.push('Nenhuma conta neste mês.');
  lines.forEach((line) => {
    if (y > 280) { doc.addPage(); y = 18; }
    doc.text(line, 14, y); y += 6;
  });
  doc.save(`financeiro-${currentFilters().month}.pdf`);
}

function generateRecurringBills(monthsAhead = 18) {
  const baseMonth = currentMonth();
  state.recurring.forEach((rec) => {
    for (let i = 0; i <= monthsAhead; i++) {
      const month = addMonths(baseMonth, i);
      const dueDate = `${month}-${String(rec.day).padStart(2, '0')}`;
      const exists = state.bills.some((b) => b.recurringId === rec.id && b.dueDate === dueDate);
      if (!exists) {
        state.bills.push({
          id: uid(),
          description: rec.description,
          amount: Number(rec.amount || 0),
          dueDate,
          category: rec.category || 'Outros',
          personId: rec.personId || '',
          paid: false,
          receipt: null,
          notes: '',
          recurringId: rec.id,
          installmentInfo: null,
          paymentMethod: rec.paymentMethod || 'Pix'
        });
      }
    }
  });
}

function buildPersonSummary(incomes, bills) {
  return state.people.map((person) => {
    const personIncomes = incomes.filter((i) => i.personId === person.id);
    const personBills = bills.filter((b) => b.personId === person.id);
    return {
      person,
      income: sum(personIncomes, 'amount'),
      bills: sum(personBills, 'amount'),
      open: sum(personBills.filter((b) => !b.paid), 'amount'),
      paid: sum(personBills.filter((b) => b.paid), 'amount'),
      forecast: sum(personIncomes, 'amount') - sum(personBills.filter((b) => !b.paid), 'amount')
    };
  }).filter((entry) => entry.income || entry.bills || entry.open || entry.paid);
}

function calculateForecastForMonth(month) {
  const incomes = state.incomes.filter((i) => i.date.startsWith(month));
  const bills = state.bills.filter((b) => b.dueDate.startsWith(month));
  return sum(incomes, 'amount') - sum(bills.filter((b) => !b.paid), 'amount');
}

function personMarkup(person) {
  if (!person) return 'Sem pessoa';
  return `<span class="person-pill"><span class="person-dot" style="background:${escapeAttr(person.color || '#57d6ff')}"></span>${escapeHtml(person.name)}</span>`;
}

function personName(personId) {
  return getPerson(personId)?.name || 'Sem pessoa';
}

function getPerson(personId) {
  return state.people.find((p) => p.id === personId);
}

function sum(arr, key) {
  return arr.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function parseMoney(value) {
  return Number(value || 0);
}

function splitInstallments(total, count) {
  const base = Math.floor((total * 100) / count);
  let remainder = Math.round(total * 100) - base * count;
  return Array.from({ length: count }, () => {
    const cents = base + (remainder-- > 0 ? 1 : 0);
    return cents / 100;
  });
}

function addMonths(month, amount) {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonthsToDate(dateStr, amount) {
  const [year, mon, day] = dateStr.split('-').map(Number);
  const date = new Date(year, mon - 1 + amount, 1);
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${month}-${String(Math.min(28, day)).padStart(2, '0')}`;
}

function clampDay(day) {
  return Math.min(28, Math.max(1, Number(day || 1)));
}

function billStatusKey(item) {
  if (item.paid) return 'paid';
  if (item.dueDate < today()) return 'overdue';
  if (item.dueDate === today()) return 'today';
  return 'open';
}

function billStatusText(item) {
  return ({ paid: 'Paga', overdue: 'Vencida', today: 'Vence hoje', open: 'Em aberto' })[billStatusKey(item)];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
