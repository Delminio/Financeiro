const STORAGE_KEY = 'financeiro_premium_v2';
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const formatMoney = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const parseNum = (v) => Number(v || 0);

const state = loadState();
ensureSeeds();
generateRecurringBills(18);
setDefaultInputs();
initTabs();
initForms();
initActions();
renderAll();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved || { incomes: [], bills: [], recurring: [], goals: [] };
  } catch {
    return { incomes: [], bills: [], recurring: [], goals: [] };
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function setDefaultInputs() {
  document.querySelector('#incomeForm [name="date"]').value = today();
  document.querySelector('#billForm [name="dueDate"]').value = today();
  document.querySelector('#goalForm [name="month"]').value = currentMonth();
  document.querySelector('#monthFilter').value = currentMonth();
  updateMonthLabel();
}
function updateMonthLabel() {
  const m = getSelectedMonth();
  document.getElementById('monthLabel').textContent = `Visão de ${m}`;
}
function ensureSeeds() {
  if (state.incomes.length || state.bills.length || state.recurring.length || state.goals.length) return;
  state.incomes.push({ id: uid(), description: 'Salário', amount: 3500, date: `${currentMonth()}-05` });
  state.bills.push({ id: uid(), description: 'Aluguel', amount: 1200, dueDate: `${currentMonth()}-10`, category: 'Moradia', paid: false, receipt: null, notes: '', installmentInfo: null });
  state.goals.push({ id: uid(), month: currentMonth(), target: 800, note: 'Reserva do mês' });
  state.recurring.push({ id: uid(), description: 'Internet', amount: 120, day: 15, category: 'Internet' });
  saveState();
}
function getSelectedMonth() {
  return document.getElementById('monthFilter').value || currentMonth();
}
function monthItems() {
  const month = getSelectedMonth();
  return {
    incomes: state.incomes.filter(i => i.date.startsWith(month)),
    bills: state.bills.filter(b => b.dueDate.startsWith(month))
  };
}
function addMonths(monthStr, add) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + add, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}
function buildDate(monthStr, day) {
  return `${monthStr}-${String(Math.min(28, Math.max(1, Number(day)))).padStart(2,'0')}`;
}
function generateRecurringBills(monthsAhead = 12) {
  const baseMonth = currentMonth();
  state.recurring.forEach(rec => {
    for (let i = 0; i <= monthsAhead; i++) {
      const month = addMonths(baseMonth, i);
      const dueDate = buildDate(month, rec.day);
      const exists = state.bills.some(b => b.recurringId === rec.id && b.dueDate === dueDate);
      if (!exists) {
        state.bills.push({
          id: uid(), description: rec.description, amount: rec.amount, dueDate, category: rec.category,
          paid: false, receipt: null, notes: '', recurringId: rec.id, installmentInfo: null
        });
      }
    }
  });
  saveState();
}

function initTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      document.getElementById('pageTitle').textContent = btn.textContent;
    });
  });
  document.getElementById('monthFilter').addEventListener('change', () => {
    updateMonthLabel();
    renderAll();
  });
}

function initForms() {
  document.getElementById('incomeForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.incomes.unshift({
      id: uid(),
      description: fd.get('description'),
      amount: parseNum(fd.get('amount')),
      date: fd.get('date')
    });
    e.target.reset();
    document.querySelector('#incomeForm [name="date"]').value = today();
    afterMutation();
  });

  document.getElementById('billForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const installments = Math.max(1, parseInt(fd.get('installments'), 10) || 1);
    const total = parseNum(fd.get('amount'));
    const perInstallment = Number((total / installments).toFixed(2));
    const base = fd.get('dueDate').slice(0, 7);
    for (let i = 0; i < installments; i++) {
      const month = addMonths(base, i);
      state.bills.unshift({
        id: uid(),
        description: installments > 1 ? `${fd.get('description')} (${i + 1}/${installments})` : fd.get('description'),
        amount: perInstallment,
        dueDate: buildDate(month, fd.get('dueDate').slice(8, 10)),
        category: fd.get('category'),
        paid: false,
        receipt: null,
        notes: '',
        installmentInfo: installments > 1 ? { current: i + 1, total: installments, group: fd.get('description') } : null
      });
    }
    e.target.reset();
    document.querySelector('#billForm [name="dueDate"]').value = today();
    document.querySelector('#billForm [name="installments"]').value = 1;
    afterMutation();
  });

  document.getElementById('recurringForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.recurring.unshift({
      id: uid(),
      description: fd.get('description'),
      amount: parseNum(fd.get('amount')),
      day: parseInt(fd.get('day'), 10),
      category: fd.get('category')
    });
    e.target.reset();
    generateRecurringBills(18);
    afterMutation();
  });

  document.getElementById('goalForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const existing = state.goals.find(g => g.month === fd.get('month'));
    if (existing) {
      existing.target = parseNum(fd.get('target'));
      existing.note = fd.get('note');
    } else {
      state.goals.unshift({ id: uid(), month: fd.get('month'), target: parseNum(fd.get('target')), note: fd.get('note') });
    }
    afterMutation();
  });
}

function initActions() {
  document.getElementById('billSearch').addEventListener('input', renderBills);
  document.getElementById('backupBtn').addEventListener('click', downloadBackup);
  document.getElementById('restoreInput').addEventListener('change', restoreBackup);
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm('Tem certeza que quer apagar todos os dados?')) return;
    state.incomes = []; state.bills = []; state.recurring = []; state.goals = [];
    afterMutation();
  });
  document.getElementById('exportExcelBtn').addEventListener('click', exportExcel);
  document.getElementById('exportPdfBtn').addEventListener('click', exportPdf);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeModal();
  });
}

function afterMutation() {
  generateRecurringBills(18);
  saveState();
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderIncomes();
  renderBills();
  renderRecurring();
  renderGoals();
  renderBackupSummary();
}

let barChart, doughnutChart;
function renderDashboard() {
  const { incomes, bills } = monthItems();
  const totalIncome = incomes.reduce((a,b)=>a+b.amount,0);
  const totalBills = bills.reduce((a,b)=>a+b.amount,0);
  const totalOpen = bills.filter(b=>!b.paid).reduce((a,b)=>a+b.amount,0);
  const forecast = totalIncome - totalOpen;
  document.getElementById('metricIncome').textContent = formatMoney(totalIncome);
  document.getElementById('metricBills').textContent = formatMoney(totalBills);
  document.getElementById('metricOpen').textContent = formatMoney(totalOpen);
  document.getElementById('metricForecast').textContent = formatMoney(forecast);

  const overdue = bills.filter(b=>!b.paid && b.dueDate < today());
  const dueToday = bills.filter(b=>!b.paid && b.dueDate === today());
  document.getElementById('overdueAlert').textContent = overdue.length ? `Você tem ${overdue.length} conta(s) vencida(s), total ${formatMoney(overdue.reduce((a,b)=>a+b.amount,0))}.` : 'Nenhuma conta vencida.';
  document.getElementById('todayAlert').textContent = dueToday.length ? `${dueToday.length} conta(s) vencem hoje, total ${formatMoney(dueToday.reduce((a,b)=>a+b.amount,0))}.` : 'Nenhuma conta vencendo hoje.';

  const goal = state.goals.find(g=>g.month===getSelectedMonth());
  document.getElementById('goalAlert').textContent = goal
    ? `Meta do mês: ${formatMoney(goal.target)}. Previsão atual: ${formatMoney(forecast)}. ${forecast >= goal.target ? 'Meta atingida.' : 'Ainda faltando.'}`
    : 'Meta do mês ainda não definida.';

  const upcoming = bills
    .filter(b=>!b.paid && b.dueDate >= today())
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate))
    .slice(0,8);
  const upcomingBox = document.getElementById('upcomingBills');
  upcomingBox.innerHTML = upcoming.length ? upcoming.map(b => `
    <div class="item">
      <div class="item-top">
        <h4>${escapeHtml(b.description)}</h4>
        <span class="badge ${statusClass(b)}">${statusText(b)}</span>
      </div>
      <small>${b.category || 'Sem categoria'} • vence em ${b.dueDate}</small>
      <strong>${formatMoney(b.amount)}</strong>
    </div>`).join('') : '<div class="item"><small>Nenhuma conta próxima por agora.</small></div>';

  const barData = [totalIncome, totalBills, totalOpen, forecast];
  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: { labels: ['Recebimentos', 'Contas', 'Em aberto', 'Previsão'], datasets: [{ data: barData, borderRadius: 12 }] },
    options: chartOptions()
  });

  const paid = bills.filter(b=>b.paid).reduce((a,b)=>a+b.amount,0);
  const open = bills.filter(b=>!b.paid && b.dueDate >= today()).reduce((a,b)=>a+b.amount,0);
  const overdueSum = bills.filter(b=>!b.paid && b.dueDate < today()).reduce((a,b)=>a+b.amount,0);
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(document.getElementById('doughnutChart'), {
    type: 'doughnut',
    data: { labels: ['Pago', 'Em aberto', 'Vencido'], datasets: [{ data: [paid, open, overdueSum], borderWidth: 0 }] },
    options: chartOptions(true)
  });
}

function chartOptions(doughnut = false) {
  return {
    plugins: { legend: { labels: { color: '#dce9ff' } } },
    scales: doughnut ? {} : {
      x: { ticks: { color: '#dce9ff' }, grid: { color: 'rgba(255,255,255,.06)' } },
      y: { ticks: { color: '#dce9ff' }, grid: { color: 'rgba(255,255,255,.06)' } }
    }
  };
}

function renderIncomes() {
  const list = document.getElementById('incomeList');
  const items = monthItems().incomes.sort((a,b)=>b.date.localeCompare(a.date));
  list.innerHTML = items.length ? items.map(item => `
    <div class="item">
      <div class="item-top">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <small>${item.date}</small>
        </div>
        <strong>${formatMoney(item.amount)}</strong>
      </div>
      <div class="item-actions">
        <button class="mini-btn" onclick="openEdit('income','${item.id}')">Editar</button>
        <button class="mini-btn" onclick="removeItem('income','${item.id}')">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="item"><small>Nenhum recebimento neste mês.</small></div>';
}

function renderBills() {
  const term = document.getElementById('billSearch').value.toLowerCase().trim();
  const list = document.getElementById('billList');
  const items = monthItems().bills
    .filter(b => !term || b.description.toLowerCase().includes(term) || (b.category || '').toLowerCase().includes(term))
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  list.innerHTML = items.length ? items.map(item => `
    <div class="item">
      <div class="item-top">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <small>${item.category || 'Sem categoria'} • vence em ${item.dueDate}</small>
        </div>
        <span class="badge ${statusClass(item)}">${statusText(item)}</span>
      </div>
      <strong>${formatMoney(item.amount)}</strong>
      ${item.installmentInfo ? `<small>Parcela ${item.installmentInfo.current}/${item.installmentInfo.total}</small>` : ''}
      <div class="item-actions">
        <button class="mini-btn" onclick="togglePaid('${item.id}')">${item.paid ? 'Desmarcar paga' : 'Marcar paga'}</button>
        <button class="mini-btn" onclick="openEdit('bill','${item.id}')">Editar</button>
        <button class="mini-btn" onclick="uploadReceipt('${item.id}')">Comprovante</button>
        ${item.receipt ? `<a class="file-link" href="${item.receipt.data}" download="${item.receipt.name}">Baixar comprovante</a>` : ''}
        <button class="mini-btn" onclick="removeItem('bill','${item.id}')">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="item"><small>Nenhuma conta neste mês.</small></div>';
}

function renderRecurring() {
  const list = document.getElementById('recurringList');
  list.innerHTML = state.recurring.length ? state.recurring.map(item => `
    <div class="item">
      <div class="item-top">
        <div>
          <h4>${escapeHtml(item.description)}</h4>
          <small>${item.category} • dia ${item.day} de todo mês</small>
        </div>
        <strong>${formatMoney(item.amount)}</strong>
      </div>
      <div class="item-actions">
        <button class="mini-btn" onclick="openEdit('recurring','${item.id}')">Editar</button>
        <button class="mini-btn" onclick="removeItem('recurring','${item.id}')">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="item"><small>Nenhuma conta recorrente cadastrada.</small></div>';
}

function renderGoals() {
  const list = document.getElementById('goalList');
  list.innerHTML = state.goals.length ? state.goals.sort((a,b)=>b.month.localeCompare(a.month)).map(item => `
    <div class="item">
      <div class="item-top">
        <div>
          <h4>${item.month}</h4>
          <small>${escapeHtml(item.note || 'Sem observação')}</small>
        </div>
        <strong>${formatMoney(item.target)}</strong>
      </div>
      <div class="item-actions">
        <button class="mini-btn" onclick="openEdit('goal','${item.id}')">Editar</button>
        <button class="mini-btn" onclick="removeItem('goal','${item.id}')">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="item"><small>Nenhuma meta cadastrada.</small></div>';
}

function renderBackupSummary() {
  document.getElementById('backupSummary').innerHTML = `
    Recebimentos: <strong>${state.incomes.length}</strong><br>
    Contas: <strong>${state.bills.length}</strong><br>
    Recorrentes: <strong>${state.recurring.length}</strong><br>
    Metas: <strong>${state.goals.length}</strong><br>
    Mês atual filtrado: <strong>${getSelectedMonth()}</strong>
  `;
}

function statusText(item) {
  if (item.paid) return 'Paga';
  if (item.dueDate < today()) return 'Vencida';
  if (item.dueDate === today()) return 'Hoje';
  return 'Em aberto';
}
function statusClass(item) {
  if (item.paid) return 'paid';
  if (item.dueDate < today()) return 'overdue';
  if (item.dueDate === today()) return 'today';
  return 'open';
}

window.togglePaid = (id) => {
  const item = state.bills.find(b=>b.id===id);
  if (!item) return;
  item.paid = !item.paid;
  afterMutation();
};

window.removeItem = (type, id) => {
  if (!confirm('Deseja excluir este item?')) return;
  if (type === 'income') state.incomes = state.incomes.filter(i=>i.id!==id);
  if (type === 'bill') state.bills = state.bills.filter(i=>i.id!==id);
  if (type === 'recurring') {
    state.recurring = state.recurring.filter(i=>i.id!==id);
    state.bills = state.bills.filter(b=>b.recurringId !== id);
  }
  if (type === 'goal') state.goals = state.goals.filter(i=>i.id!==id);
  afterMutation();
};

window.uploadReceipt = (id) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bill = state.bills.find(b=>b.id===id);
      if (!bill) return;
      bill.receipt = { name: file.name, data: reader.result };
      afterMutation();
    };
    reader.readAsDataURL(file);
  };
  input.click();
};

window.openEdit = (type, id) => {
  const modal = document.getElementById('editModal');
  const form = document.getElementById('editForm');
  let item;
  if (type === 'income') item = state.incomes.find(i=>i.id===id);
  if (type === 'bill') item = state.bills.find(i=>i.id===id);
  if (type === 'recurring') item = state.recurring.find(i=>i.id===id);
  if (type === 'goal') item = state.goals.find(i=>i.id===id);
  if (!item) return;

  let html = '';
  if (type === 'income') {
    html = `
      <label>Descrição<input name="description" value="${escapeAttr(item.description)}" /></label>
      <label>Valor<input name="amount" type="number" step="0.01" value="${item.amount}" /></label>
      <label>Data<input name="date" type="date" value="${item.date}" /></label>`;
  }
  if (type === 'bill') {
    html = `
      <label>Descrição<input name="description" value="${escapeAttr(item.description)}" /></label>
      <label>Valor<input name="amount" type="number" step="0.01" value="${item.amount}" /></label>
      <label>Vencimento<input name="dueDate" type="date" value="${item.dueDate}" /></label>
      <label>Categoria<input name="category" value="${escapeAttr(item.category || '')}" /></label>`;
  }
  if (type === 'recurring') {
    html = `
      <label>Descrição<input name="description" value="${escapeAttr(item.description)}" /></label>
      <label>Valor<input name="amount" type="number" step="0.01" value="${item.amount}" /></label>
      <label>Dia<input name="day" type="number" min="1" max="28" value="${item.day}" /></label>
      <label>Categoria<input name="category" value="${escapeAttr(item.category || '')}" /></label>`;
  }
  if (type === 'goal') {
    html = `
      <label>Mês<input name="month" type="month" value="${item.month}" /></label>
      <label>Meta<input name="target" type="number" step="0.01" value="${item.target}" /></label>
      <label>Observação<input name="note" value="${escapeAttr(item.note || '')}" /></label>`;
  }
  form.innerHTML = `${html}<button class="btn" type="submit">Salvar alterações</button>`;
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    Object.keys(item).forEach(k => {
      if (fd.has(k)) item[k] = fd.get(k);
    });
    if (fd.has('amount')) item.amount = parseNum(fd.get('amount'));
    if (fd.has('target')) item.target = parseNum(fd.get('target'));
    if (fd.has('day')) item.day = parseInt(fd.get('day'), 10);
    closeModal();
    afterMutation();
  };
  modal.classList.remove('hidden');
};

function closeModal() {
  document.getElementById('editModal').classList.add('hidden');
}
window.closeModal = closeModal;

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
      state.incomes = data.incomes || [];
      state.bills = data.bills || [];
      state.recurring = data.recurring || [];
      state.goals = data.goals || [];
      afterMutation();
      alert('Backup restaurado com sucesso.');
    } catch {
      alert('Arquivo inválido.');
    }
  };
  reader.readAsText(file);
}

function exportExcel() {
  const month = getSelectedMonth();
  const rows = [['Tipo','Descrição','Valor','Data/Vencimento','Categoria','Status']];
  monthItems().incomes.forEach(i => rows.push(['Recebimento', i.description, i.amount, i.date, '', 'Recebido']));
  monthItems().bills.forEach(b => rows.push(['Conta', b.description, b.amount, b.dueDate, b.category || '', statusText(b)]));
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `financeiro-${month}.csv`);
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const month = getSelectedMonth();
  const { incomes, bills } = monthItems();
  let y = 18;
  pdf.setFontSize(18); pdf.text(`Financeiro Premium - ${month}`, 14, y); y += 12;
  pdf.setFontSize(11);
  pdf.text(`Recebimentos: ${formatMoney(incomes.reduce((a,b)=>a+b.amount,0))}`, 14, y); y += 8;
  pdf.text(`Contas: ${formatMoney(bills.reduce((a,b)=>a+b.amount,0))}`, 14, y); y += 8;
  pdf.text(`Em aberto: ${formatMoney(bills.filter(b=>!b.paid).reduce((a,b)=>a+b.amount,0))}`, 14, y); y += 12;
  pdf.setFontSize(13); pdf.text('Contas do mês', 14, y); y += 8;
  pdf.setFontSize(10);
  bills.slice(0, 18).forEach((b) => {
    pdf.text(`${b.dueDate} • ${b.description} • ${formatMoney(b.amount)} • ${statusText(b)}`, 14, y);
    y += 7;
  });
  pdf.save(`financeiro-${month}.pdf`);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(str='') {
  return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function escapeAttr(str='') { return escapeHtml(str); }
