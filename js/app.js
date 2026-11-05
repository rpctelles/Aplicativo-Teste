// Minhas Finanças — aplicativo principal.
import * as store from './store.js';
import { monthSummary, recurringForMonth, byCategory, monthlySeries, lastMonths, txOfMonth } from './calc.js';
import * as charts from './charts.js';
import { exportExcel, exportCSV, exportBackupFile, deliverFile } from './export.js';
import { openSheet, closeSheet, confirmDialog, toast, ICONS } from './ui.js';
import {
  money, signedMoney, parseMoney, centsToInput, currentMonth, addMonths, monthLabel, monthLong, monthShort,
  monthShortYear, dayLabel, dateShort, dateBR, todayISO, monthOf, dateInMonth, daysInMonth, esc, normalize, sum,
} from './utils.js';

const APP_VERSION = '1.0.0';

const app = {
  month: currentMonth(),
  route: 'inicio',
  txFilter: { type: 'all', q: '', cat: '' },
  reportPeriod: '6',
  installPrompt: null,
};

const TITLES = { inicio: 'Finanças', lancamentos: 'Lançamentos', fixas: 'Contas fixas', graficos: 'Gráficos', mais: 'Mais' };
const view = document.getElementById('view');
const fab = document.getElementById('fab');

// =====================================================================
// Renderização / rotas
// =====================================================================
function render() {
  charts.destroyAll();
  const r = app.route;
  document.getElementById('page-title').textContent = TITLES[r];
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  document.getElementById('month-nav').hidden = r === 'mais';
  const ml = document.getElementById('month-label');
  ml.textContent = monthLabel(app.month);
  ml.classList.toggle('is-current', app.month === currentMonth());
  fab.hidden = r === 'mais' || r === 'graficos';
  fab.setAttribute('aria-label', r === 'fixas' ? 'Nova conta fixa' : 'Novo lançamento');
  VIEWS[r]();
  updateBadge();
}

function updateBadge() {
  const late = recurringForMonth(currentMonth()).filter((i) => i.status === 'late' && i.rec.type === 'despesa').length;
  const b = document.getElementById('badge-fixas');
  b.hidden = !late;
  b.textContent = late;
}

function routeFromHash() {
  const h = location.hash.replace('#', '');
  app.route = TITLES[h] ? h : 'inicio';
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', routeFromHash);

document.querySelectorAll('[data-month-step]').forEach((b) =>
  b.addEventListener('click', () => { app.month = addMonths(app.month, Number(b.dataset.monthStep)); render(); }));
document.getElementById('month-label').addEventListener('click', () => { app.month = currentMonth(); render(); });

fab.addEventListener('click', () => (app.route === 'fixas' ? openRecForm() : openTxForm()));

store.subscribe(() => render());

// =====================================================================
// Componentes de lista
// =====================================================================
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const catIcon = (c) => `<div class="cat-icon" style="background:${c.color}22">${esc(c.icon)}</div>`;

function txRow(t) {
  const c = store.category(t.category);
  const sub = [c.name, t.payment, t.recurringId ? '🔁 fixa' : ''].filter(Boolean).join(' · ');
  return `<li class="item tappable" data-action="edit-tx" data-id="${t.id}">
    ${catIcon(c)}
    <div class="item-main"><div class="item-title">${esc(t.description || c.name)}</div><div class="item-sub">${esc(sub)}</div></div>
    <div class="item-amount num ${t.type === 'receita' ? 'income' : ''}">${signedMoney(t.amount, t.type)}</div>
  </li>`;
}

function recStatusText(i) {
  const isIncome = i.rec.type === 'receita';
  if (i.paid) return { text: `${isIncome ? 'Recebido' : 'Pago'} em ${dateShort(i.tx.date)}`, cls: 'paid', pill: isIncome ? 'Recebido' : 'Pago' };
  const d = i.daysToDue;
  if (d < 0) return { text: d === -1 ? 'Venceu ontem' : `Venceu há ${-d} dias`, cls: 'late', pill: 'Atrasada' };
  if (d === 0) return { text: isIncome ? 'Previsto para hoje' : 'Vence hoje', cls: 'soon', pill: 'Hoje' };
  if (d === 1) return { text: isIncome ? 'Previsto para amanhã' : 'Vence amanhã', cls: 'soon', pill: 'Amanhã' };
  if (d <= 3) return { text: `${isIncome ? 'Previsto em' : 'Vence em'} ${d} dias`, cls: 'soon', pill: `${d} dias` };
  return { text: `${isIncome ? 'Previsto para' : 'Vence'} dia ${Number(i.dueDate.slice(8, 10))}`, cls: 'info', pill: dateShort(i.dueDate) };
}

function recRow(i) {
  const c = store.category(i.rec.category);
  const st = recStatusText(i);
  const inst = i.installmentNo ? ` <span class="muted small">${i.installmentNo}/${i.rec.installments}</span>` : '';
  return `<li class="item">
    <button class="check-btn ${i.paid ? 'done' : ''} ${st.cls === 'late' ? 'late' : ''}" data-action="rec-toggle" data-id="${i.rec.id}" data-month="${i.month}"
      aria-label="${i.paid ? 'Desmarcar pagamento' : 'Marcar como pago'}: ${esc(i.rec.name)}">${ICONS.check}</button>
    <div class="item-main tappable" data-action="rec-open" data-id="${i.rec.id}" data-month="${i.month}">
      <div class="item-title">${esc(c.icon)} ${esc(i.rec.name)}${inst}</div>
      <div class="item-sub ${st.cls === 'late' ? 'danger' : ''}">${esc(st.text)} · ${esc(c.name)}</div>
    </div>
    <div class="item-amount num tappable ${i.rec.type === 'receita' ? 'income' : ''}" data-action="rec-open" data-id="${i.rec.id}" data-month="${i.month}">
      ${money(i.amount)}<small><span class="pill ${st.cls}">${esc(st.pill)}</span></small>
    </div>
  </li>`;
}

function categoryLegend(items, total) {
  return `<ul class="legend">${items.map((i) => `
    <li>
      <span class="dot" style="background:${i.cat.color}"></span>
      <span>${esc(i.cat.icon)} ${esc(i.cat.name)}<span class="pct">${Math.round(i.pct * 100)}%</span></span>
      <b class="num">${money(i.value)}</b>
      <span class="bar"><i style="width:${total ? Math.max(2, (i.value / items[0].value) * 100) : 0}%;background:${i.cat.color}"></i></span>
    </li>`).join('')}</ul>`;
}

// =====================================================================
// Tela: Início
// =====================================================================
function renderHome() {
  if (!store.hasData()) {
    view.innerHTML = `
      <div class="card empty">
        <span class="emoji">👋</span>
        <h3>Bem-vindo(a) ao seu controle financeiro</h3>
        <p>Comece pelo básico: cadastre sua <b>renda</b> e suas <b>contas fixas</b> (aluguel, internet, plano de saúde…). Depois é só ir anotando os gastos do dia a dia.</p>
        <div class="actions">
          <button class="btn btn-block" data-action="new-rec" data-type="receita">💼 Cadastrar minha renda</button>
          <button class="btn btn-block btn-ghost" data-action="new-rec" data-type="despesa">📅 Cadastrar uma conta fixa</button>
          <button class="btn btn-block btn-ghost" data-action="new-tx">➕ Anotar um gasto</button>
          <button class="link" data-action="sample">Quero ver um exemplo com dados fictícios</button>
        </div>
      </div>
      <div class="banner info"><span>🔒</span><div class="grow">Seus dados ficam <b>somente neste celular</b>. Nada é enviado para a internet.</div></div>`;
    return;
  }

  const s = monthSummary(app.month);
  const cm = currentMonth();
  const isPast = app.month < cm;
  const neg = s.free < 0;
  let sub;
  if (isPast) sub = neg ? 'Faltou dinheiro neste mês.' : 'Foi o que sobrou neste mês.';
  else if (neg) sub = 'Atenção: pelas contas previstas, o mês fecha no vermelho.';
  else if (s.perDay) sub = `≈ <b>${money(s.perDay)} por dia</b> nos próximos ${s.daysLeft} dia${s.daysLeft > 1 ? 's' : ''}`;
  else sub = '';

  const lines = [
    ['Receitas do mês (previstas)', s.expectedIncome, '+'],
    ['Contas fixas', s.fixedTotal, '−'],
    ['Gastos variáveis', s.variableExpense, '−'],
  ];
  if (s.savingsGoal) lines.push(['Meta de economia', s.savingsGoal, '−']);
  if (store.getState().settings.carryOver) lines.unshift(['Saldo dos meses anteriores', Math.abs(s.carry), s.carry < 0 ? '−' : '+']);

  const pending = s.recs.filter((i) => !i.paid);
  const expRecs = s.recs.filter((i) => i.rec.type === 'despesa');
  const paidCount = expRecs.filter((i) => i.paid).length;
  const cats = byCategory([app.month]).slice(0, 6);
  const catTotal = sum(cats, (c) => c.value);
  const recent = [...s.txs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);

  const st = store.getState().settings;
  const needBackup = store.getState().transactions.length >= 10 &&
    (!st.lastBackup || Date.now() - new Date(st.lastBackup) > 30 * 864e5) &&
    (!st.backupSnooze || Date.now() > new Date(st.backupSnooze).getTime());

  view.innerHTML = `
    ${app.installPrompt ? `<div class="banner info"><span>📲</span><div class="grow">Instale o app na tela inicial para abrir mais rápido e usar offline.</div><button class="btn" data-action="install">Instalar</button></div>` : ''}
    ${needBackup ? `<div class="banner"><span>💾</span><div class="grow">Seus dados ficam só neste celular. Faça um backup de vez em quando.</div>
      <div style="display:flex;flex-direction:column;gap:4px"><button class="btn" data-action="backup">Backup</button><button class="link tiny" data-action="snooze-backup">Agora não</button></div></div>` : ''}

    <section class="card hero ${neg ? 'negative' : ''}">
      <div class="hero-label">${isPast ? 'Resultado do mês' : 'Livre para gastar'} · ${monthLong(app.month)}</div>
      <div class="hero-value num">${money(s.free)}</div>
      ${sub ? `<div class="hero-sub">${sub}</div>` : ''}
      <div class="hero-breakdown num">
        ${lines.map(([l, v, sign]) => `<div><span>${l}</span><span>${sign} ${money(v)}</span></div>`).join('')}
        <div class="total"><span>= ${isPast ? 'Sobra' : 'Livre para gastar'}</span><span>${money(s.free)}</span></div>
      </div>
    </section>

    <div class="grid-2">
      <div class="card stat">
        <div class="stat-label"><span class="dot" style="background:var(--income)"></span>Recebido</div>
        <div class="stat-value num income">${money(s.incomeReceived)}</div>
        <div class="stat-sub">${s.incomePending ? `+ ${money(s.incomePending)} a receber` : 'nada pendente'}</div>
      </div>
      <div class="card stat">
        <div class="stat-label"><span class="dot" style="background:var(--expense)"></span>Gasto</div>
        <div class="stat-value num expense">${money(s.expensePaid)}</div>
        <div class="stat-sub">${s.fixedPending ? `+ ${money(s.fixedPending)} a pagar` : 'contas em dia'}</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>Contas do mês</h2><a class="link" href="#fixas">Ver todas</a></div>
      ${expRecs.length ? `
        <div class="small muted" style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${paidCount} de ${expRecs.length} pagas</span><span class="num">${money(s.fixedPaid)} de ${money(s.fixedTotal)}</span></div>
        <div class="progress"><i style="width:${s.fixedTotal ? (s.fixedPaid / s.fixedTotal) * 100 : 0}%"></i></div>` : ''}
      ${pending.length ? `<ul class="list" style="margin-top:6px">${pending.slice(0, 5).map(recRow).join('')}</ul>
        ${pending.length > 5 ? `<a class="link small" href="#fixas">+ ${pending.length - 5} pendentes</a>` : ''}`
        : s.recs.length ? `<p class="muted small" style="margin:12px 0 0">✅ Tudo pago e recebido neste mês.</p>`
        : `<p class="muted small">Nenhuma conta fixa cadastrada. <button class="link" data-action="new-rec" data-type="despesa">Cadastrar</button></p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Para onde foi o dinheiro</h2><a class="link" href="#graficos">Gráficos</a></div>
      ${cats.length ? `<div class="chart-box donut"><canvas id="ch-home-cat"></canvas></div>${categoryLegend(cats, catTotal)}`
        : '<p class="muted small">Nenhum gasto registrado neste mês.</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>Últimos lançamentos</h2><a class="link" href="#lancamentos">Ver todos</a></div>
      ${recent.length ? `<ul class="list">${recent.map(txRow).join('')}</ul>` : '<p class="muted small">Nenhum lançamento neste mês.</p>'}
    </section>`;

  if (cats.length) {
    charts.doughnut(document.getElementById('ch-home-cat'), cats.map((c) => ({ label: c.cat.name, value: c.value, color: c.cat.color })));
  }
}

// =====================================================================
// Tela: Lançamentos
// =====================================================================
function renderTransactions() {
  const f = app.txFilter;
  const all = txOfMonth(app.month);
  const q = normalize(f.q);
  const list = all
    .filter((t) => f.type === 'all' || (f.type === 'fixa' ? !!t.recurringId : t.type === f.type))
    .filter((t) => !f.cat || t.category === f.cat)
    .filter((t) => !q || normalize(`${t.description} ${store.category(t.category).name} ${t.notes} ${t.payment}`).includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  const inc = sum(list.filter((t) => t.type === 'receita'), (t) => t.amount);
  const exp = sum(list.filter((t) => t.type === 'despesa'), (t) => t.amount);

  const groups = new Map();
  list.forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });

  const usedCats = [...new Set(all.map((t) => t.category))].map(store.category).sort((a, b) => a.name.localeCompare(b.name));
  const chip = (val, label) => `<button class="chip ${f.type === val ? 'active' : ''}" data-action="tx-filter" data-type="${val}">${label}</button>`;

  view.innerHTML = `
    <div class="summary-strip num">
      <div><span>Receitas</span><b class="income">${money(inc)}</b></div>
      <div><span>Despesas</span><b class="expense">${money(exp)}</b></div>
      <div><span>Saldo</span><b class="${inc - exp < 0 ? 'danger' : ''}">${money(inc - exp)}</b></div>
    </div>
    <div class="toolbar">
      <label class="search">${ICONS.search}<input type="search" id="tx-search" placeholder="Buscar lançamento" value="${esc(f.q)}" aria-label="Buscar"></label>
      <select class="input" id="tx-cat" style="width:auto;min-width:0;flex:0 1 150px" aria-label="Filtrar por categoria">
        <option value="">Categoria</option>
        ${usedCats.map((c) => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="chips">${chip('all', 'Todos')}${chip('despesa', 'Despesas')}${chip('receita', 'Receitas')}${chip('fixa', 'Contas fixas')}</div>
    <div id="tx-list">
    ${list.length ? [...groups.entries()].map(([date, items]) => {
      const dayTotal = sum(items, (t) => (t.type === 'receita' ? t.amount : -t.amount));
      return `<div class="day-group">
        <div class="day-head"><span>${esc(cap(dayLabel(date)))}${dayLabel(date).length < 8 ? ` · ${dateShort(date)}` : ''}</span><span class="num">${dayTotal >= 0 ? '+' : '−'} ${money(Math.abs(dayTotal))}</span></div>
        <div class="card"><ul class="list">${items.map(txRow).join('')}</ul></div>
      </div>`;
    }).join('') : `<div class="card empty"><span class="emoji">🧾</span><h3>${all.length ? 'Nada encontrado' : 'Nenhum lançamento'}</h3>
      <p>${all.length ? 'Tente outro filtro ou busca.' : `Toque no <b>+</b> para anotar um gasto ou receita de ${monthLong(app.month)}.`}</p></div>`}
    </div>`;

  const search = document.getElementById('tx-search');
  search.addEventListener('input', () => {
    f.q = search.value;
    const pos = search.selectionStart;
    renderTransactions();
    const s2 = document.getElementById('tx-search');
    s2.focus();
    s2.setSelectionRange(pos, pos);
  });
  document.getElementById('tx-cat').addEventListener('change', (e) => { f.cat = e.target.value; renderTransactions(); });
}

// =====================================================================
// Tela: Contas fixas
// =====================================================================
function renderFixed() {
  const recs = recurringForMonth(app.month);
  const exp = recs.filter((i) => i.rec.type === 'despesa');
  const inc = recs.filter((i) => i.rec.type === 'receita');
  const total = sum(exp, (i) => i.amount);
  const paid = sum(exp.filter((i) => i.paid), (i) => i.amount);
  const late = exp.filter((i) => i.status === 'late');
  const allCount = store.getState().recurring.length;

  if (!recs.length) {
    view.innerHTML = `
      <div class="card empty"><span class="emoji">📅</span>
        <h3>${allCount ? 'Nenhuma conta fixa neste mês' : 'Cadastre suas contas fixas'}</h3>
        <p>Contas fixas são tudo que se repete todo mês: aluguel, condomínio, internet, academia, parcelas… e também o seu <b>salário</b>. Assim o app calcula quanto sobra livre para gastar.</p>
        <div class="actions">
          <button class="btn btn-block" data-action="new-rec" data-type="despesa">Nova conta fixa</button>
          <button class="btn btn-block btn-ghost" data-action="new-rec" data-type="receita">Nova receita fixa (salário)</button>
          ${allCount ? '<button class="link" data-action="manage-rec">Ver todas as contas cadastradas</button>' : ''}
        </div>
      </div>`;
    return;
  }

  view.innerHTML = `
    <section class="card">
      <div class="card-head"><h2>Contas a pagar em ${monthShort(app.month)}</h2><span class="num"><b>${money(total)}</b></span></div>
      <div class="progress"><i style="width:${total ? (paid / total) * 100 : 0}%"></i></div>
      <div class="small muted" style="display:flex;justify-content:space-between;margin-top:6px">
        <span>Pago: <b class="num">${money(paid)}</b></span><span>Falta: <b class="num ${late.length ? 'danger' : ''}">${money(total - paid)}</b></span>
      </div>
      ${late.length ? `<div class="banner" style="margin:12px 0 0;background:var(--danger-soft)"><span>⚠️</span><div class="grow">${late.length} conta${late.length > 1 ? 's' : ''} atrasada${late.length > 1 ? 's' : ''}: ${money(sum(late, (i) => i.amount))}</div></div>` : ''}
    </section>

    ${exp.length ? `<div class="section-title">Despesas fixas</div>
      <section class="card" style="padding:4px 14px"><ul class="list">${exp.map(recRow).join('')}</ul></section>` : ''}
    ${inc.length ? `<div class="section-title">Receitas fixas</div>
      <section class="card" style="padding:4px 14px"><ul class="list">${inc.map(recRow).join('')}</ul></section>` : ''}

    <p class="small muted" style="text-align:center">Toque no círculo para marcar como pago. Toque na conta para ajustar o valor, editar ou encerrar.</p>
    <div class="btn-row">
      <button class="btn btn-ghost" data-action="new-rec" data-type="receita">+ Receita fixa</button>
      <button class="btn btn-ghost" data-action="manage-rec">Gerenciar todas</button>
    </div>`;
}

// =====================================================================
// Tela: Gráficos
// =====================================================================
function renderReports() {
  const p = app.reportPeriod;
  let months;
  if (p === 'ano') {
    const y = app.month.slice(0, 4);
    months = Array.from({ length: Number(app.month.slice(5, 7)) }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  } else months = lastMonths(app.month, Number(p));

  const series = monthlySeries(months);
  const withData = series.filter((r) => r.income || r.expense);
  const n = Math.max(1, withData.length);
  const totInc = sum(series, (r) => r.income);
  const totExp = sum(series, (r) => r.expense);
  const rate = totInc ? (totInc - totExp) / totInc : 0;
  const cats = byCategory(months);
  const catTotal = sum(cats, (c) => c.value);
  const labels = months.map(months.length > 6 ? monthShort : monthShortYear);
  const chip = (val, label) => `<button class="chip ${p === val ? 'active' : ''}" data-action="report-period" data-period="${val}">${label}</button>`;

  view.innerHTML = `
    <div class="chips">${chip('3', '3 meses')}${chip('6', '6 meses')}${chip('12', '12 meses')}${chip('ano', `Ano de ${app.month.slice(0, 4)}`)}</div>
    ${!withData.length ? `<div class="card empty"><span class="emoji">📊</span><h3>Sem dados no período</h3><p>Registre receitas e despesas para ver os gráficos.</p></div>` : `
    <div class="kpis">
      <div class="card stat"><div class="stat-label">Média de receitas</div><div class="stat-value num income">${money(totInc / n)}</div><div class="stat-sub">por mês</div></div>
      <div class="card stat"><div class="stat-label">Média de gastos</div><div class="stat-value num expense">${money(totExp / n)}</div><div class="stat-sub">por mês</div></div>
      <div class="card stat"><div class="stat-label">Saldo do período</div><div class="stat-value num ${totInc - totExp < 0 ? 'danger' : ''}">${money(totInc - totExp)}</div><div class="stat-sub">${withData.length} ${withData.length > 1 ? 'meses' : 'mês'} com dados</div></div>
      <div class="card stat"><div class="stat-label">Taxa de economia</div><div class="stat-value num ${rate < 0 ? 'danger' : ''}">${Math.round(rate * 100)}%</div><div class="stat-sub">da renda guardada</div></div>
    </div>

    <section class="card"><div class="card-head"><h2>Receitas × Despesas</h2></div><div class="chart-box tall"><canvas id="ch-ie"></canvas></div></section>

    <section class="card"><div class="card-head"><h2>Gastos por categoria</h2><span class="small muted num">${money(catTotal)}</span></div>
      ${cats.length ? `<div class="chart-box donut"><canvas id="ch-cat"></canvas></div>${categoryLegend(cats, catTotal)}` : '<p class="muted small">Sem gastos no período.</p>'}
    </section>

    <section class="card"><div class="card-head"><h2>Contas fixas × gastos variáveis</h2></div><div class="chart-box"><canvas id="ch-fv"></canvas></div></section>

    <section class="card"><div class="card-head"><h2>Evolução do saldo acumulado</h2></div><div class="chart-box"><canvas id="ch-acc"></canvas></div>
      <p class="tiny muted" style="margin:8px 0 0">Saldo inicial (em Mais › Configurações) + tudo que entrou − tudo que saiu.</p></section>

    <section class="card"><div class="card-head"><h2>Resumo mês a mês</h2></div>
      <div class="table-wrap"><table class="table num">
        <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th></tr></thead>
        <tbody>${series.map((r) => `<tr><td>${monthShortYear(r.month)}</td><td class="income">${money(r.income)}</td><td class="expense">${money(r.expense)}</td><td class="${r.balance < 0 ? 'danger' : ''}">${money(r.balance)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th>${money(totInc)}</th><th>${money(totExp)}</th><th>${money(totInc - totExp)}</th></tr></tfoot>
      </table></div>
    </section>
    <button class="btn btn-block btn-outline" data-action="export">${ICONS.download} Exportar para Excel</button>`}`;

  if (!withData.length) return;
  charts.incomeExpenseBars(document.getElementById('ch-ie'), labels, series.map((r) => r.income), series.map((r) => r.expense), series.map((r) => r.balance));
  if (cats.length) charts.doughnut(document.getElementById('ch-cat'), cats.map((c) => ({ label: c.cat.name, value: c.value, color: c.cat.color })));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  charts.stackedBars(document.getElementById('ch-fv'), labels, [
    { label: 'Contas fixas', data: series.map((r) => r.fixed), color: css('--primary') },
    { label: 'Variáveis', data: series.map((r) => r.variable), color: css('--expense') },
  ]);
  charts.lineChart(document.getElementById('ch-acc'), labels, series.map((r) => r.accumulated), 'Saldo acumulado');
}

// =====================================================================
// Tela: Mais
// =====================================================================
function renderMore() {
  const s = store.getState();
  const item = (action, icon, title, sub) =>
    `<li><button data-action="${action}"><span class="mi">${icon}</span><span class="mt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${ICONS.chevron}</button></li>`;
  const last = s.settings.lastBackup ? `Último: ${dateBR(s.settings.lastBackup.slice(0, 10))}` : 'Nenhum backup feito ainda';

  view.innerHTML = `
    ${app.installPrompt ? `<div class="banner info"><span>📲</span><div class="grow">Instale na tela inicial para usar como um app, mesmo offline.</div><button class="btn" data-action="install">Instalar</button></div>` : ''}
    <div class="section-title">Planejamento</div>
    <section class="card" style="padding:2px 14px"><ul class="menu">
      ${item('settings', '🎯', 'Meta de economia e saldo', `Meta: ${money(s.settings.savingsGoal)} por mês`)}
      ${item('categories', '🏷️', 'Categorias', `${s.categories.length} categorias`)}
      ${item('manage-rec', '📅', 'Todas as contas fixas', `${s.recurring.length} cadastradas`)}
      ${item('investments', '📈', 'Investimentos', 'Em breve')}
    </ul></section>

    <div class="section-title">Exportar e backup</div>
    <section class="card" style="padding:2px 14px"><ul class="menu">
      ${item('export', '📗', 'Exportar para Excel', 'Planilha .xlsx com resumo, lançamentos e categorias')}
      ${item('backup', '💾', 'Fazer backup', last)}
      ${item('restore', '♻️', 'Restaurar backup', 'Carregar um arquivo .json salvo antes')}
    </ul></section>

    <div class="section-title">App</div>
    <section class="card" style="padding:2px 14px"><ul class="menu">
      ${item('theme', '🌓', 'Aparência', { auto: 'Automática (igual ao celular)', light: 'Clara', dark: 'Escura' }[s.settings.theme] || 'Automática')}
      ${item('about', 'ℹ️', 'Sobre e privacidade', `Versão ${APP_VERSION}`)}
      ${item('reset', '🗑️', 'Apagar todos os dados', 'Começar do zero')}
    </ul></section>
    <input type="file" id="restore-input" accept="application/json,.json" hidden>
    <p class="tiny muted" style="text-align:center;margin-top:18px">Minhas Finanças · seus dados ficam só neste aparelho</p>`;

  document.getElementById('restore-input').addEventListener('change', onRestoreFile);
}

const VIEWS = { inicio: renderHome, lancamentos: renderTransactions, fixas: renderFixed, graficos: renderReports, mais: renderMore };

// =====================================================================
// Formulários
// =====================================================================
const catGrid = (type, selected) => store.categories(type).map((c) =>
  `<button type="button" class="cat-opt ${c.id === selected ? 'active' : ''}" data-cat="${c.id}"><span class="e">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('');

const payChips = (selected) => store.PAYMENT_METHODS.map((p) =>
  `<button type="button" class="chip ${p === selected ? 'active' : ''}" data-pay="${p}">${p}</button>`).join('');

function wireCommonForm(root, f, onTypeChange) {
  root.querySelectorAll('[data-type-opt]').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    f.type = b.dataset.typeOpt;
    root.querySelectorAll('[data-type-opt]').forEach((x) => x.classList.toggle('active', x === b));
    root.querySelector('.amount-field').className = `amount-field t-${f.type}`;
    f.category = store.categories(f.type)[0]?.id;
    root.querySelector('#f-cats').innerHTML = catGrid(f.type, f.category);
    onTypeChange?.();
  }));
  root.querySelector('#f-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    f.category = b.dataset.cat;
    root.querySelectorAll('#f-cats .cat-opt').forEach((x) => x.classList.toggle('active', x === b));
  });
  root.querySelector('#f-pay')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    f.payment = f.payment === b.dataset.pay ? '' : b.dataset.pay;
    root.querySelectorAll('#f-pay .chip').forEach((x) => x.classList.toggle('active', x.dataset.pay === f.payment));
  });
}

const typeSeg = (type, disabled) => `
  <div class="segmented">
    <button type="button" class="t-despesa ${type === 'despesa' ? 'active' : ''}" data-type-opt="despesa" ${disabled ? 'disabled' : ''}>Despesa</button>
    <button type="button" class="t-receita ${type === 'receita' ? 'active' : ''}" data-type-opt="receita" ${disabled ? 'disabled' : ''}>Receita</button>
  </div>`;

function defaultDateFor(month) {
  return monthOf(todayISO()) === month ? todayISO() : dateInMonth(month, 1);
}

// ---------- Lançamento ----------
function openTxForm(existing, defaults = {}) {
  const isEdit = !!existing;
  const linked = existing?.recurringId ? store.recurring(existing.recurringId) : null;
  const type = existing?.type || defaults.type || 'despesa';
  const f = {
    type,
    category: existing?.category || store.categories(type)[0]?.id,
    payment: existing?.payment || '',
  };
  const date = existing?.date || defaultDateFor(app.month);
  const lm = existing?.recurringMonth;

  const root = openSheet(`
    <h2 id="sheet-title">${isEdit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
    <form id="tx-form" novalidate>
      ${typeSeg(f.type, !!linked)}
      <div class="amount-field t-${f.type}"><span>R$</span>
        <input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${centsToInput(existing?.amount)}" ${isEdit ? '' : 'autofocus'} aria-label="Valor">
      </div>
      <div class="field"><label for="f-desc">Descrição</label>
        <input class="input" id="f-desc" maxlength="80" placeholder="Ex.: Mercado, Uber, Salário…" value="${esc(existing?.description)}" autocomplete="off"></div>
      <div class="field"><span class="field-label">Categoria</span><div class="cat-grid" id="f-cats">${catGrid(f.type, f.category)}</div></div>
      <div class="field"><label for="f-date">Data</label>
        <input class="input" type="date" id="f-date" value="${date}" ${lm ? `min="${lm}-01" max="${dateInMonth(lm, 31)}"` : ''}>
        ${linked ? `<div class="hint">🔁 Pagamento da conta fixa “${esc(linked.name)}” de ${monthLong(lm)}.</div>` : ''}</div>
      <div class="field"><span class="field-label">Forma de pagamento <span class="muted">(opcional)</span></span><div class="pay-chips" id="f-pay">${payChips(f.payment)}</div></div>
      ${!isEdit ? `<label class="switch-row"><div><div class="t">Repete todo mês</div><div class="d">Vira uma conta fixa (já marcada como paga neste mês)</div></div>
        <span class="switch"><input type="checkbox" id="f-repeat"><i></i></span></label>` : ''}
      <div class="field"><label for="f-notes">Observações <span class="muted">(opcional)</span></label>
        <textarea class="input" id="f-notes" maxlength="500">${esc(existing?.notes)}</textarea></div>
      <div class="form-actions">
        ${isEdit ? `<button type="button" class="btn btn-danger-ghost" id="f-del" style="flex:0 0 auto">${ICONS.trash}</button>` : ''}
        <button type="submit" class="btn">Salvar</button>
      </div>
    </form>`);

  wireCommonForm(root, f);

  root.querySelector('#tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseMoney(root.querySelector('#f-amount').value);
    if (!(amount > 0)) { toast('Informe um valor maior que zero.'); root.querySelector('#f-amount').focus(); return; }
    let d = root.querySelector('#f-date').value || todayISO();
    if (lm && monthOf(d) !== lm) d = dateInMonth(lm, Number(d.slice(8, 10)));
    const description = root.querySelector('#f-desc').value;
    const notes = root.querySelector('#f-notes').value;
    const repeat = root.querySelector('#f-repeat')?.checked;
    await closeSheet();
    if (repeat) {
      const rec = store.saveRecurring({ type: f.type, name: description || store.category(f.category).name, amount, category: f.category,
        dueDay: Number(d.slice(8, 10)), startMonth: monthOf(d), payment: f.payment, notes });
      store.payRecurring(rec.id, monthOf(d), { amount, date: d });
      toast('Conta fixa criada e marcada como paga ✓');
    } else {
      store.saveTransaction({ ...existing, type: f.type, amount, date: d, description, category: f.category, payment: f.payment, notes });
      toast(isEdit ? 'Lançamento atualizado' : `${f.type === 'receita' ? 'Receita' : 'Despesa'} de ${money(amount)} salva ✓`);
    }
    if (monthOf(d) !== app.month) { app.month = monthOf(d); render(); }
  });

  root.querySelector('#f-del')?.addEventListener('click', async () => {
    const ok = await confirmDialog('Excluir lançamento?', linked ? 'A conta fixa voltará a aparecer como não paga neste mês.' : 'Esta ação pode ser desfeita logo em seguida.', { ok: 'Excluir', danger: true });
    if (!ok) return;
    const copy = { ...existing };
    await closeSheet();
    store.deleteTransaction(existing.id);
    toast('Lançamento excluído', { action: 'Desfazer', onAction: () => store.saveTransaction(copy) });
  });
}

// ---------- Conta fixa ----------
function openRecForm(existing, defaults = {}) {
  const isEdit = !!existing;
  const type = existing?.type || defaults.type || 'despesa';
  const f = { type, category: existing?.category || store.categories(type)[type === 'receita' ? 0 : 0]?.id, payment: existing?.payment || '' };
  let duration = existing?.installments ? 'parcelas' : existing?.endMonth ? 'ate' : 'sempre';

  const root = openSheet(`
    <h2 id="sheet-title">${isEdit ? 'Editar conta fixa' : type === 'receita' ? 'Nova receita fixa' : 'Nova conta fixa'}</h2>
    <form id="rec-form" novalidate>
      ${typeSeg(f.type, false)}
      <div class="field"><label for="f-name">Nome</label>
        <input class="input" id="f-name" maxlength="60" placeholder="${type === 'receita' ? 'Ex.: Salário' : 'Ex.: Aluguel, Internet, Academia'}" value="${esc(existing?.name)}" ${isEdit ? '' : 'autofocus'} autocomplete="off"></div>
      <span class="field-label">Valor previsto por mês</span>
      <div class="amount-field t-${f.type}"><span>R$</span>
        <input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${centsToInput(existing?.amount)}" aria-label="Valor previsto"></div>
      <div class="hint" style="margin:-10px 0 14px">Se o valor muda todo mês (luz, água), coloque uma média. Na hora de pagar você ajusta o valor real.</div>
      <div class="field"><span class="field-label">Categoria</span><div class="cat-grid" id="f-cats">${catGrid(f.type, f.category)}</div></div>
      <div class="field-row">
        <div class="field"><label for="f-due" id="f-due-label">${type === 'receita' ? 'Dia que recebe' : 'Dia do vencimento'}</label>
          <input class="input" type="number" id="f-due" min="1" max="31" inputmode="numeric" value="${existing?.dueDay || Number(todayISO().slice(8, 10))}"></div>
        <div class="field"><label for="f-start">Começa em</label>
          <input class="input" type="month" id="f-start" value="${existing?.startMonth || app.month}"></div>
      </div>
      <div class="field"><span class="field-label">Duração</span>
        <div class="segmented" id="f-dur" style="margin-bottom:10px">
          <button type="button" data-dur="sempre">Sem prazo</button>
          <button type="button" data-dur="parcelas">Parcelado</button>
          <button type="button" data-dur="ate">Até um mês</button>
        </div>
        <div id="dur-parcelas"><label class="field-label" for="f-inst">Número de parcelas</label>
          <input class="input" type="number" id="f-inst" min="1" max="480" inputmode="numeric" placeholder="Ex.: 10" value="${existing?.installments || ''}"></div>
        <div id="dur-ate"><label class="field-label" for="f-end">Último mês</label>
          <input class="input" type="month" id="f-end" value="${existing?.endMonth || ''}"></div>
      </div>
      <div class="field"><span class="field-label">Forma de pagamento <span class="muted">(opcional)</span></span><div class="pay-chips" id="f-pay">${payChips(f.payment)}</div></div>
      <div class="field"><label for="f-notes">Observações <span class="muted">(opcional)</span></label>
        <textarea class="input" id="f-notes" maxlength="500">${esc(existing?.notes)}</textarea></div>
      <div class="form-actions"><button type="submit" class="btn">Salvar</button></div>
      ${isEdit ? `<div class="btn-row" style="margin-top:10px">
        <button type="button" class="btn btn-ghost" id="f-end-btn">${ICONS.stop} Encerrar</button>
        <button type="button" class="btn btn-danger-ghost" id="f-del">${ICONS.trash} Excluir</button></div>` : ''}
    </form>`);

  const syncDur = () => {
    root.querySelectorAll('#f-dur [data-dur]').forEach((b) => b.classList.toggle('active', b.dataset.dur === duration));
    root.querySelector('#dur-parcelas').hidden = duration !== 'parcelas';
    root.querySelector('#dur-ate').hidden = duration !== 'ate';
  };
  syncDur();
  root.querySelector('#f-dur').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dur]');
    if (b) { duration = b.dataset.dur; syncDur(); }
  });
  wireCommonForm(root, f, () => {
    root.querySelector('#f-due-label').textContent = f.type === 'receita' ? 'Dia que recebe' : 'Dia do vencimento';
  });

  root.querySelector('#rec-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = root.querySelector('#f-name').value.trim();
    const amount = parseMoney(root.querySelector('#f-amount').value);
    const dueDay = Number(root.querySelector('#f-due').value);
    const startMonth = root.querySelector('#f-start').value || app.month;
    if (!name) { toast('Dê um nome para a conta.'); root.querySelector('#f-name').focus(); return; }
    if (!(amount > 0)) { toast('Informe o valor previsto.'); root.querySelector('#f-amount').focus(); return; }
    if (!(dueDay >= 1 && dueDay <= 31)) { toast('O dia deve ser entre 1 e 31.'); return; }
    let installments = null, endMonth = null;
    if (duration === 'parcelas') {
      installments = Number(root.querySelector('#f-inst').value);
      if (!(installments >= 1)) { toast('Informe o número de parcelas.'); return; }
    } else if (duration === 'ate') {
      endMonth = root.querySelector('#f-end').value;
      if (!endMonth || endMonth < startMonth) { toast('O último mês deve ser depois do início.'); return; }
    }
    const notes = root.querySelector('#f-notes').value;
    await closeSheet();
    store.saveRecurring({ id: existing?.id, type: f.type, name, amount, category: f.category, dueDay, startMonth, endMonth, installments,
      payment: f.payment, notes });
    toast(isEdit ? 'Conta fixa atualizada' : 'Conta fixa cadastrada ✓');
  });

  root.querySelector('#f-end-btn')?.addEventListener('click', () => endRecFlow(existing.id));
  root.querySelector('#f-del')?.addEventListener('click', () => deleteRecFlow(existing.id));
}

async function endRecFlow(id) {
  const r = store.recurring(id);
  const ok = await confirmDialog(`Encerrar “${r.name}”?`,
    `Ela não aparecerá mais a partir de ${monthLong(addMonths(app.month, 1))}. O histórico de pagamentos continua salvo.`, { ok: 'Encerrar' });
  if (!ok) return;
  await closeSheet();
  store.endRecurring(id, app.month < r.startMonth ? r.startMonth : app.month);
  toast('Conta fixa encerrada');
}

async function deleteRecFlow(id) {
  const r = store.recurring(id);
  const ok = await confirmDialog(`Excluir “${r.name}”?`,
    'A conta some de todos os meses. Pagamentos já registrados continuam como lançamentos comuns. Para só parar de cobrar, use “Encerrar”.', { ok: 'Excluir', danger: true });
  if (!ok) return;
  await closeSheet();
  store.deleteRecurring(id);
  toast('Conta fixa excluída');
}

// ---------- Ações de uma conta fixa no mês ----------
function openRecActions(id, month) {
  const i = recurringForMonth(month).find((x) => x.rec.id === id);
  if (!i) return;
  const r = i.rec;
  const c = store.category(r.category);
  const st = recStatusText(i);
  const isIncome = r.type === 'receita';
  const payDate = i.tx?.date || (monthOf(todayISO()) === month ? todayISO() : i.dueDate);

  const root = openSheet(`
    <h2 id="sheet-title">${esc(c.icon)} ${esc(r.name)}</h2>
    <div class="card" style="box-shadow:none;background:var(--bg)">
      <div style="display:flex;justify-content:space-between;gap:8px"><span class="muted">Mês</span><b>${monthLong(month)}</b></div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span class="muted">${isIncome ? 'Previsto para' : 'Vencimento'}</span><b>${dateBR(i.dueDate)}</b></div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span class="muted">Valor previsto</span><b class="num">${money(r.amount)}</b></div>
      ${i.installmentNo ? `<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span class="muted">Parcela</span><b>${i.installmentNo} de ${r.installments}</b></div>` : ''}
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span class="muted">Situação</span><span class="pill ${st.cls}">${esc(st.text)}</span></div>
    </div>
    ${i.paid ? `
      <p class="muted small">${isIncome ? 'Recebido' : 'Pago'}: <b class="num">${money(i.tx.amount)}</b> em ${dateBR(i.tx.date)}.</p>
      <div class="action-list">
        <button class="btn btn-ghost" id="a-edit-pay">${ICONS.edit} Editar ${isIncome ? 'recebimento' : 'pagamento'}</button>
        <button class="btn btn-ghost" id="a-unpay">${ICONS.undo} Desmarcar como ${isIncome ? 'recebido' : 'pago'}</button>
      </div>` : `
      <form id="pay-form" novalidate>
        <span class="field-label">Valor ${isIncome ? 'recebido' : 'pago'}</span>
        <div class="amount-field t-${r.type}"><span>R$</span><input id="p-amount" inputmode="decimal" value="${centsToInput(r.amount)}" aria-label="Valor"></div>
        <div class="field"><label for="p-date">Data</label><input class="input" type="date" id="p-date" value="${payDate}" min="${month}-01" max="${dateInMonth(month, 31)}"></div>
        <button class="btn btn-block" type="submit">${ICONS.check} Marcar como ${isIncome ? 'recebido' : 'pago'}</button>
      </form>`}
    <div class="section-title">Conta fixa</div>
    <div class="action-list">
      <button class="btn btn-ghost" id="a-edit">${ICONS.edit} Editar conta fixa (valor, dia, categoria…)</button>
      <button class="btn btn-ghost" id="a-end">${ICONS.stop} Encerrar após ${monthLong(month)}</button>
      <button class="btn btn-danger-ghost" id="a-del">${ICONS.trash} Excluir conta fixa</button>
    </div>`);

  root.querySelector('#pay-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseMoney(root.querySelector('#p-amount').value);
    if (!(amount > 0)) { toast('Informe o valor.'); return; }
    let d = root.querySelector('#p-date').value || payDate;
    if (monthOf(d) !== month) d = payDate;
    await closeSheet();
    store.payRecurring(id, month, { amount, date: d });
    toast(`${r.name}: ${isIncome ? 'recebido' : 'pago'} ✓`);
  });
  root.querySelector('#a-edit-pay')?.addEventListener('click', () => openTxForm(i.tx));
  root.querySelector('#a-unpay')?.addEventListener('click', async () => {
    await closeSheet();
    const copy = { ...i.tx };
    store.unpayRecurring(id, month);
    toast('Pagamento desmarcado', { action: 'Desfazer', onAction: () => store.saveTransaction(copy) });
  });
  root.querySelector('#a-edit').addEventListener('click', () => openRecForm(r));
  root.querySelector('#a-end').addEventListener('click', async () => {
    const ok = await confirmDialog(`Encerrar “${r.name}”?`, `Ela não aparecerá mais a partir de ${monthLong(addMonths(month, 1))}. O histórico continua salvo.`, { ok: 'Encerrar' });
    if (!ok) return;
    await closeSheet();
    store.endRecurring(id, month);
    toast('Conta fixa encerrada');
  });
  root.querySelector('#a-del').addEventListener('click', () => deleteRecFlow(id));
}

async function toggleRec(id, month) {
  const i = recurringForMonth(month).find((x) => x.rec.id === id);
  if (!i) return;
  if (i.paid) {
    const copy = { ...i.tx };
    store.unpayRecurring(id, month);
    toast(`${i.rec.name}: pagamento desmarcado`, { action: 'Desfazer', onAction: () => store.saveTransaction(copy) });
  } else {
    const date = monthOf(todayISO()) === month ? todayISO() : i.dueDate;
    store.payRecurring(id, month, { date });
    toast(`${i.rec.name}: ${money(i.rec.amount)} ${i.rec.type === 'receita' ? 'recebido' : 'pago'} ✓`, {
      action: 'Desfazer', onAction: () => store.unpayRecurring(id, month),
    });
  }
}

// ---------- Gerenciar todas as contas fixas ----------
function openManageRecurring() {
  const all = [...store.getState().recurring].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const cm = currentMonth();
  const row = (r) => {
    const c = store.category(r.category);
    let status = 'Ativa';
    if (r.endMonth && r.endMonth < cm) status = `Encerrada em ${monthShortYear(r.endMonth)}`;
    else if (r.startMonth > cm) status = `Começa em ${monthShortYear(r.startMonth)}`;
    else if (r.installments) status = `${r.installments}x · até ${monthShortYear(r.endMonth)}`;
    else if (r.endMonth) status = `Até ${monthShortYear(r.endMonth)}`;
    return `<li class="item tappable" data-action="edit-rec" data-id="${r.id}">${catIcon(c)}
      <div class="item-main"><div class="item-title">${esc(r.name)}</div><div class="item-sub">Dia ${r.dueDay} · ${esc(status)}</div></div>
      <div class="item-amount num ${r.type === 'receita' ? 'income' : ''}">${money(r.amount)}<small>${r.type === 'receita' ? 'receita' : 'despesa'}</small></div></li>`;
  };
  const exp = all.filter((r) => r.type === 'despesa');
  const inc = all.filter((r) => r.type === 'receita');
  const activeExp = exp.filter((r) => r.startMonth <= cm && (!r.endMonth || r.endMonth >= cm));
  openSheet(`
    <h2 id="sheet-title">Todas as contas fixas</h2>
    <p class="muted small">Despesas fixas ativas hoje: <b class="num">${money(sum(activeExp, (r) => r.amount))}</b> por mês.</p>
    ${inc.length ? `<div class="section-title">Receitas</div><ul class="list">${inc.map(row).join('')}</ul>` : ''}
    ${exp.length ? `<div class="section-title">Despesas</div><ul class="list">${exp.map(row).join('')}</ul>` : ''}
    ${!all.length ? '<p class="muted">Nenhuma conta fixa cadastrada.</p>' : ''}
    <div class="btn-row" style="margin-top:14px">
      <button class="btn btn-ghost" data-action="new-rec" data-type="receita">+ Receita</button>
      <button class="btn" data-action="new-rec" data-type="despesa">+ Despesa</button>
    </div>`);
}

// ---------- Configurações ----------
function openSettings() {
  const s = store.getState().settings;
  const root = openSheet(`
    <h2 id="sheet-title">Meta de economia e saldo</h2>
    <form id="set-form" novalidate>
      <div class="field"><label for="s-goal">Quanto quero guardar por mês</label>
        <input class="input" id="s-goal" inputmode="decimal" placeholder="0,00" value="${centsToInput(s.savingsGoal)}">
        <div class="hint">Esse valor é reservado antes de calcular o “livre para gastar”. Pense nele como pagar a si mesmo primeiro.</div></div>
      <label class="switch-row"><div><div class="t">Somar saldo dos meses anteriores</div>
        <div class="d">Se ligado, o que sobrou (ou faltou) nos meses anteriores entra no “livre para gastar”.</div></div>
        <span class="switch"><input type="checkbox" id="s-carry" ${s.carryOver ? 'checked' : ''}><i></i></span></label>
      <div class="field"><label for="s-init">Saldo inicial (dinheiro que você já tinha)</label>
        <input class="input" id="s-init" inputmode="decimal" placeholder="0,00" value="${s.initialBalance < 0 ? '-' : ''}${centsToInput(Math.abs(s.initialBalance))}">
        <div class="hint">Usado no saldo acumulado e quando a opção acima estiver ligada. Pode ser negativo (ex.: -500).</div></div>
      <div class="form-actions"><button type="submit" class="btn">Salvar</button></div>
    </form>`);
  root.querySelector('#set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goal = parseMoney(root.querySelector('#s-goal').value || '0');
    const rawInit = root.querySelector('#s-init').value.trim();
    const neg = rawInit.startsWith('-');
    const init = parseMoney(rawInit.replace('-', '') || '0');
    if (!(goal >= 0) || Number.isNaN(init)) { toast('Valor inválido.'); return; }
    const carryOver = root.querySelector('#s-carry').checked;
    await closeSheet();
    store.saveSettings({ savingsGoal: goal, initialBalance: neg ? -init : init, carryOver });
    toast('Configurações salvas');
  });
}

function openTheme() {
  const cur = store.getState().settings.theme || 'auto';
  const root = openSheet(`
    <h2 id="sheet-title">Aparência</h2>
    <div class="segmented">
      ${[['auto', 'Automática'], ['light', 'Clara'], ['dark', 'Escura']].map(([v, l]) => `<button data-theme-opt="${v}" class="${cur === v ? 'active' : ''}">${l}</button>`).join('')}
    </div>`);
  root.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => {
    store.saveSettings({ theme: b.dataset.themeOpt });
    applyTheme();
    root.querySelectorAll('[data-theme-opt]').forEach((x) => x.classList.toggle('active', x === b));
  }));
}

function applyTheme() {
  const t = store.getState().settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0d1117' : '#f3f5f7';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); render(); });

// ---------- Categorias ----------
let catTab = 'despesa';
function openCategories() {
  const list = store.categories(catTab);
  const root = openSheet(`
    <h2 id="sheet-title">Categorias</h2>
    <div class="segmented">
      <button data-ct="despesa" class="t-despesa ${catTab === 'despesa' ? 'active' : ''}">Despesas</button>
      <button data-ct="receita" class="t-receita ${catTab === 'receita' ? 'active' : ''}">Receitas</button>
    </div>
    <ul class="list">${list.map((c) => {
      const n = store.categoryUsage(c.id);
      return `<li class="item tappable" data-cat-edit="${c.id}">${catIcon(c)}<div class="item-main"><div class="item-title">${esc(c.name)}</div>
        <div class="item-sub">${n ? `${n} uso${n > 1 ? 's' : ''}` : 'Sem uso'}</div></div>${ICONS.chevron}</li>`;
    }).join('')}</ul>
    <button class="btn btn-block" style="margin-top:14px" id="cat-new">${ICONS.plus} Nova categoria</button>`);
  root.querySelectorAll('[data-ct]').forEach((b) => b.addEventListener('click', () => { catTab = b.dataset.ct; openCategories(); }));
  root.querySelectorAll('[data-cat-edit]').forEach((li) => li.addEventListener('click', () => openCategoryForm(store.category(li.dataset.catEdit))));
  root.querySelector('#cat-new').addEventListener('click', () => openCategoryForm(null));
}

const PALETTE = ['#6366f1', '#22c55e', '#f97316', '#0ea5e9', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#d946ef', '#14b8a6', '#64748b', '#a16207', '#84cc16', '#f472b6', '#0d9488', '#2563eb'];
function openCategoryForm(cat) {
  const isEdit = !!cat;
  const f = { color: cat?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)] };
  const isFallback = isEdit && cat.id === store.FALLBACK_CATEGORY[cat.type];
  const root = openSheet(`
    <h2 id="sheet-title">${isEdit ? 'Editar categoria' : `Nova categoria de ${catTab === 'receita' ? 'receita' : 'despesa'}`}</h2>
    <form id="cat-form" novalidate>
      <div class="field-row" style="grid-template-columns:90px 1fr">
        <div class="field"><label for="c-icon">Emoji</label><input class="input" id="c-icon" maxlength="4" value="${esc(cat?.icon || '📌')}" style="text-align:center;font-size:20px"></div>
        <div class="field"><label for="c-name">Nome</label><input class="input" id="c-name" maxlength="30" value="${esc(cat?.name)}" ${isEdit ? '' : 'autofocus'}></div>
      </div>
      <div class="field"><span class="field-label">Cor</span><div class="pay-chips" id="c-colors">
        ${PALETTE.map((c) => `<button type="button" data-color="${c}" aria-label="Cor ${c}" style="width:34px;height:34px;border-radius:50%;border:3px solid ${c === f.color ? 'var(--text)' : 'transparent'};background:${c}"></button>`).join('')}
      </div></div>
      <div class="form-actions">
        ${isEdit && !isFallback ? `<button type="button" class="btn btn-danger-ghost" id="c-del" style="flex:0 0 auto">${ICONS.trash}</button>` : ''}
        <button type="submit" class="btn">Salvar</button>
      </div>
      ${isFallback ? '<p class="hint">Esta categoria não pode ser excluída: ela recebe os lançamentos de categorias apagadas.</p>' : ''}
    </form>`);
  root.querySelector('#c-colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    f.color = b.dataset.color;
    root.querySelectorAll('[data-color]').forEach((x) => (x.style.borderColor = x === b ? 'var(--text)' : 'transparent'));
  });
  root.querySelector('#cat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = root.querySelector('#c-name').value.trim();
    if (!name) { toast('Dê um nome para a categoria.'); return; }
    store.saveCategory({ id: cat?.id, type: cat?.type || catTab, name, icon: root.querySelector('#c-icon').value.trim() || '📌', color: f.color });
    openCategories();
  });
  root.querySelector('#c-del')?.addEventListener('click', async () => {
    const n = store.categoryUsage(cat.id);
    const ok = await confirmDialog(`Excluir “${cat.name}”?`, n ? `${n} lançamento(s)/conta(s) passarão para a categoria “Outros”.` : 'A categoria não está em uso.', { ok: 'Excluir', danger: true });
    if (!ok) return;
    store.deleteCategory(cat.id);
    openCategories();
  });
}

// ---------- Exportar ----------
function openExport() {
  let period = 'year';
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] }));
  const root = openSheet(`
    <h2 id="sheet-title">Exportar para Excel</h2>
    <p class="muted small">A planilha tem 5 abas: <b>Resumo mensal</b>, <b>Lançamentos</b>, <b>Por categoria</b>, <b>Contas fixas</b> (situação de cada mês) e <b>Cadastro fixas</b>. Abre no Excel, Google Planilhas e LibreOffice.</p>
    <span class="field-label">Período</span>
    <div class="segmented" id="ex-period">
      <button data-p="month">${monthShortYear(app.month)}</button>
      <button data-p="year" class="active">Ano ${app.month.slice(0, 4)}</button>
      <button data-p="all">Tudo</button>
    </div>
    <div class="action-list">
      <button class="btn" id="ex-xlsx">${ICONS.download} Baixar planilha Excel (.xlsx)</button>
      ${canShare ? `<button class="btn btn-ghost" id="ex-share">${ICONS.share} Compartilhar planilha (WhatsApp, Drive, e-mail…)</button>` : ''}
      <button class="btn btn-ghost" id="ex-csv">${ICONS.download} Baixar só os lançamentos (.csv)</button>
    </div>
    <p class="hint">O arquivo vai para a pasta <b>Downloads</b> do celular.</p>`);
  root.querySelector('#ex-period').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    period = b.dataset.p;
    root.querySelectorAll('#ex-period [data-p]').forEach((x) => x.classList.toggle('active', x === b));
  });
  const run = async (btn, fn) => {
    btn.disabled = true;
    try { await fn(); } catch (err) { console.error(err); toast(err.message || 'Erro ao exportar.'); } finally { btn.disabled = false; }
  };
  root.querySelector('#ex-xlsx').addEventListener('click', (e) => run(e.currentTarget, async () => {
    const { blob, filename } = await exportExcel(period, app.month);
    await deliverFile(blob, filename);
    toast('Planilha gerada ✓');
  }));
  root.querySelector('#ex-share')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    const { blob, filename } = await exportExcel(period, app.month);
    await deliverFile(blob, filename, { share: true });
  }));
  root.querySelector('#ex-csv').addEventListener('click', (e) => run(e.currentTarget, async () => {
    const { blob, filename } = exportCSV(period, app.month);
    await deliverFile(blob, filename);
    toast('CSV gerado ✓');
  }));
}

// ---------- Backup ----------
async function doBackup() {
  const { blob, filename } = exportBackupFile(store.exportBackup());
  const canShare = navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'application/json' })] });
  if (canShare) {
    const how = await confirmDialog('Fazer backup', 'Recomendado: compartilhe o arquivo para o seu Google Drive, e-mail ou WhatsApp — assim ele fica fora do celular. Ou toque em Cancelar para apenas baixar.', { ok: 'Compartilhar' });
    await deliverFile(blob, filename, { share: how });
  } else {
    await deliverFile(blob, filename);
  }
  store.saveSettings({ lastBackup: new Date().toISOString() });
  toast('Backup salvo ✓');
}

async function onRestoreFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const n = Array.isArray(data.transactions) ? data.transactions.length : 0;
    const ok = await confirmDialog('Restaurar backup?', `O arquivo tem ${n} lançamento(s). Os dados atuais deste celular serão SUBSTITUÍDOS.`, { ok: 'Restaurar', danger: true });
    if (!ok) return;
    store.importBackup(data);
    applyTheme();
    toast('Backup restaurado ✓');
  } catch (err) {
    toast(err.message?.includes('JSON') ? 'Arquivo inválido.' : err.message || 'Não foi possível restaurar.');
  }
}

// ---------- Outros ----------
function openInvestments() {
  openSheet(`
    <h2 id="sheet-title">📈 Investimentos — em breve</h2>
    <p>O app já está preparado para receber este módulo. A ideia para as próximas versões:</p>
    <ul class="muted" style="padding-left:20px;line-height:1.7">
      <li>Cadastrar investimentos (CDB, Tesouro, ações, FIIs, cripto, poupança…)</li>
      <li>Registrar aportes e resgates (integrados ao “livre para gastar”)</li>
      <li>Acompanhar o patrimônio total e a evolução em gráfico</li>
      <li>Ver a distribuição da carteira por tipo</li>
    </ul>
    <p class="small muted">Enquanto isso, você pode registrar aportes como despesa na categoria que preferir (ex.: crie uma categoria “Investimentos”).</p>`);
}

function openAbout() {
  openSheet(`
    <h2 id="sheet-title">Sobre e privacidade</h2>
    <p><b>Minhas Finanças</b> · versão ${APP_VERSION}</p>
    <p class="muted">🔒 Seus dados ficam <b>somente neste celular</b>, no armazenamento do navegador/app. Nada é enviado para servidores — o app funciona totalmente offline.</p>
    <p class="muted">⚠️ Por isso, se você limpar os dados do Chrome, desinstalar o app ou trocar de celular, os dados podem ser perdidos. <b>Faça backups</b> de vez em quando (Mais › Fazer backup) e guarde o arquivo no Drive ou e-mail.</p>
    <p class="small muted" id="persist-info"></p>`);
  navigator.storage?.persisted?.().then((p) => {
    const el = document.getElementById('persist-info');
    if (el) el.textContent = p ? '✅ O armazenamento deste app está protegido contra limpeza automática.' : 'ℹ️ Instale o app na tela inicial para proteger melhor o armazenamento.';
  });
}

async function resetFlow() {
  const ok = await confirmDialog('Apagar TODOS os dados?', 'Lançamentos, contas fixas, categorias e configurações serão apagados deste celular. Recomendamos fazer um backup antes.', { ok: 'Apagar tudo', danger: true });
  if (!ok) return;
  store.resetAll();
  applyTheme();
  toast('Dados apagados');
  location.hash = '#inicio';
}

// =====================================================================
// Ações (delegação de cliques)
// =====================================================================
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, month, type } = el.dataset;
  switch (action) {
    case 'new-tx': openTxForm(null, { type }); break;
    case 'edit-tx': openTxForm(store.transaction(id)); break;
    case 'new-rec': openRecForm(null, { type }); break;
    case 'edit-rec': openRecForm(store.recurring(id)); break;
    case 'rec-open': openRecActions(id, month); break;
    case 'rec-toggle': toggleRec(id, month); break;
    case 'manage-rec': openManageRecurring(); break;
    case 'tx-filter': app.txFilter.type = type; renderTransactions(); break;
    case 'report-period': app.reportPeriod = el.dataset.period; render(); break;
    case 'settings': openSettings(); break;
    case 'theme': openTheme(); break;
    case 'categories': openCategories(); break;
    case 'export': openExport(); break;
    case 'backup': doBackup(); break;
    case 'snooze-backup': store.saveSettings({ backupSnooze: new Date(Date.now() + 7 * 864e5).toISOString() }); break;
    case 'restore': document.getElementById('restore-input').click(); break;
    case 'investments': openInvestments(); break;
    case 'about': openAbout(); break;
    case 'reset': resetFlow(); break;
    case 'sample': store.loadSampleData(); toast('Dados de exemplo carregados. Apague em Mais › Apagar todos os dados.'); break;
    case 'install':
      if (app.installPrompt) {
        app.installPrompt.prompt();
        await app.installPrompt.userChoice;
        app.installPrompt = null;
        render();
      }
      break;
    default: break;
  }
});

// =====================================================================
// PWA: instalação, offline e armazenamento persistente
// =====================================================================
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  render();
});
window.addEventListener('appinstalled', () => { app.installPrompt = null; render(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Nova versão do app disponível', { action: 'Atualizar', onAction: () => location.reload(), duration: 10000 });
  });
}
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); });
}

// Inicialização
applyTheme();
if (window.Chart) routeFromHash();
else window.addEventListener('load', routeFromHash, { once: true });
