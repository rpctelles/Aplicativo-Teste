// Armazenamento local (no próprio celular) usando localStorage.
import { uid, currentMonth, addMonths, todayISO } from './utils.js';

const KEY = 'minhas-financas:v1';
export const SCHEMA_VERSION = 1;

export const PAYMENT_METHODS = ['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Boleto', 'Transferência', 'Outro'];

const DEFAULT_CATEGORIES = {
  despesa: [
    ['moradia', 'Moradia', '🏠', '#6366f1'],
    ['mercado', 'Mercado', '🛒', '#22c55e'],
    ['restaurantes', 'Restaurantes', '🍽️', '#f97316'],
    ['transporte', 'Transporte', '🚗', '#0ea5e9'],
    ['contas-casa', 'Água, luz, internet', '💡', '#eab308'],
    ['saude', 'Saúde', '💊', '#ef4444'],
    ['educacao', 'Educação', '📚', '#8b5cf6'],
    ['lazer', 'Lazer', '🎉', '#ec4899'],
    ['compras', 'Compras', '🛍️', '#d946ef'],
    ['assinaturas', 'Assinaturas', '📺', '#14b8a6'],
    ['cartao', 'Cartão de crédito', '💳', '#64748b'],
    ['impostos', 'Impostos e taxas', '🧾', '#a16207'],
    ['pets', 'Pets', '🐾', '#84cc16'],
    ['cuidados', 'Cuidados pessoais', '💇', '#f472b6'],
    ['presentes', 'Presentes', '🎁', '#fb7185'],
    ['outros-despesa', 'Outros', '📦', '#94a3b8'],
  ],
  receita: [
    ['salario', 'Salário', '💼', '#16a34a'],
    ['freelance', 'Freelance / extra', '💻', '#0d9488'],
    ['rendimentos', 'Rendimentos', '📈', '#2563eb'],
    ['vendas', 'Vendas', '🏷️', '#9333ea'],
    ['reembolso', 'Reembolso', '↩️', '#0891b2'],
    ['outros-receita', 'Outros', '💰', '#65a30d'],
  ],
};

/** Categorias que não podem ser excluídas (recebem os lançamentos de categorias apagadas). */
export const FALLBACK_CATEGORY = { despesa: 'outros-despesa', receita: 'outros-receita' };

function defaultCategories() {
  const out = [];
  for (const type of ['despesa', 'receita']) {
    for (const [id, name, icon, color] of DEFAULT_CATEGORIES[type]) out.push({ id, type, name, icon, color });
  }
  return out;
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    transactions: [],
    recurring: [],
    categories: defaultCategories(),
    settings: {
      savingsGoal: 0, // centavos por mês
      initialBalance: 0, // centavos
      carryOver: false, // somar saldo dos meses anteriores no "livre para gastar"
      theme: 'auto',
      lastBackup: null,
    },
    // Reservado para o módulo de investimentos (futuro).
    investments: [],
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Falha ao ler dados', e);
    return emptyState();
  }
}

function migrate(data) {
  const base = emptyState();
  const out = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
  if (!Array.isArray(out.categories) || !out.categories.length) out.categories = base.categories;
  for (const type of ['despesa', 'receita']) {
    const fb = FALLBACK_CATEGORY[type];
    if (!out.categories.some((c) => c.id === fb)) out.categories.push(base.categories.find((c) => c.id === fb));
  }
  out.transactions = Array.isArray(out.transactions) ? out.transactions : [];
  out.recurring = Array.isArray(out.recurring) ? out.recurring : [];
  out.investments = Array.isArray(out.investments) ? out.investments : [];
  out.version = SCHEMA_VERSION;
  return out;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error(e);
    alert('Não foi possível salvar os dados neste aparelho (armazenamento cheio?). Faça um backup em "Mais".');
  }
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const hasData = () => state.transactions.length > 0 || state.recurring.length > 0;

// ---------- Categorias ----------
export const categories = (type) => state.categories.filter((c) => !type || c.type === type);
export function category(id) {
  return state.categories.find((c) => c.id === id) || { id, name: 'Sem categoria', icon: '❔', color: '#94a3b8', type: 'despesa' };
}
export function saveCategory(cat) {
  if (cat.id) {
    const i = state.categories.findIndex((c) => c.id === cat.id);
    if (i >= 0) state.categories[i] = { ...state.categories[i], ...cat };
  } else {
    state.categories.push({ ...cat, id: uid() });
  }
  persist();
}
export function deleteCategory(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat || id === FALLBACK_CATEGORY[cat.type]) return false;
  const fb = FALLBACK_CATEGORY[cat.type];
  state.transactions.forEach((t) => { if (t.category === id) t.category = fb; });
  state.recurring.forEach((r) => { if (r.category === id) r.category = fb; });
  state.categories = state.categories.filter((c) => c.id !== id);
  persist();
  return true;
}
export const categoryUsage = (id) =>
  state.transactions.filter((t) => t.category === id).length + state.recurring.filter((r) => r.category === id).length;

// ---------- Lançamentos ----------
export function saveTransaction(tx) {
  const clean = {
    id: tx.id || uid(),
    type: tx.type,
    amount: Math.abs(Math.round(tx.amount)),
    date: tx.date,
    description: (tx.description || '').trim(),
    category: tx.category,
    payment: tx.payment || '',
    notes: (tx.notes || '').trim(),
    recurringId: tx.recurringId || null,
    recurringMonth: tx.recurringMonth || null,
    updatedAt: new Date().toISOString(),
  };
  const i = state.transactions.findIndex((t) => t.id === clean.id);
  if (i >= 0) state.transactions[i] = { ...state.transactions[i], ...clean };
  else state.transactions.push({ ...clean, createdAt: clean.updatedAt });
  persist();
  return clean;
}
export function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  persist();
}
export const transaction = (id) => state.transactions.find((t) => t.id === id);

// ---------- Contas fixas / recorrentes ----------
export function saveRecurring(rec) {
  const clean = {
    id: rec.id || uid(),
    type: rec.type,
    name: (rec.name || '').trim(),
    amount: Math.abs(Math.round(rec.amount)),
    category: rec.category,
    dueDay: Math.min(31, Math.max(1, Number(rec.dueDay) || 1)),
    startMonth: rec.startMonth || currentMonth(),
    endMonth: rec.endMonth || null,
    installments: rec.installments ? Number(rec.installments) : null,
    payment: rec.payment || '',
    notes: (rec.notes || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  if (clean.installments) clean.endMonth = addMonths(clean.startMonth, clean.installments - 1);
  const i = state.recurring.findIndex((r) => r.id === clean.id);
  if (i >= 0) state.recurring[i] = { ...state.recurring[i], ...clean };
  else state.recurring.push({ ...clean, createdAt: clean.updatedAt });
  persist();
  return clean;
}
export const recurring = (id) => state.recurring.find((r) => r.id === id);

/** Encerra a conta fixa: não aparece mais a partir do mês informado, mas o histórico fica. */
export function endRecurring(id, lastMonth) {
  const r = recurring(id);
  if (!r) return;
  r.endMonth = lastMonth;
  r.installments = null;
  persist();
}
/** Exclui a conta fixa. Os pagamentos já feitos continuam como lançamentos comuns. */
export function deleteRecurring(id) {
  state.recurring = state.recurring.filter((r) => r.id !== id);
  state.transactions.forEach((t) => {
    if (t.recurringId === id) { t.recurringId = null; t.recurringMonth = null; }
  });
  persist();
}
export function paymentFor(recId, month) {
  return state.transactions.find((t) => t.recurringId === recId && t.recurringMonth === month);
}
export function payRecurring(recId, month, { amount, date } = {}) {
  const r = recurring(recId);
  if (!r) return null;
  const existing = paymentFor(recId, month);
  return saveTransaction({
    id: existing?.id,
    type: r.type,
    amount: amount ?? r.amount,
    date,
    description: r.name,
    category: r.category,
    payment: existing?.payment || r.payment,
    notes: existing?.notes || '',
    recurringId: r.id,
    recurringMonth: month,
  });
}
export function unpayRecurring(recId, month) {
  const t = paymentFor(recId, month);
  if (t) deleteTransaction(t.id);
}

// ---------- Configurações ----------
export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
}

// ---------- Backup ----------
export function exportBackup() {
  return { app: 'minhas-financas', exportedAt: new Date().toISOString(), ...state };
}
export function importBackup(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) {
    throw new Error('Arquivo de backup inválido.');
  }
  const { app, exportedAt, ...rest } = data;
  state = migrate(rest);
  persist();
}
export function resetAll() {
  state = emptyState();
  persist();
}

// ---------- Dados de exemplo ----------
export function loadSampleData() {
  const s = emptyState();
  s.settings = state.settings;
  const cm = currentMonth();
  const today = todayISO();
  const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(cm, n));
  const rnd = (min, max) => Math.round(min + Math.random() * (max - min));
  const recs = [
    { type: 'receita', name: 'Salário', amount: 650000, category: 'salario', dueDay: 5 },
    { type: 'despesa', name: 'Aluguel', amount: 180000, category: 'moradia', dueDay: 10 },
    { type: 'despesa', name: 'Condomínio', amount: 45000, category: 'moradia', dueDay: 10 },
    { type: 'despesa', name: 'Conta de luz', amount: 18000, category: 'contas-casa', dueDay: 15 },
    { type: 'despesa', name: 'Internet', amount: 11990, category: 'contas-casa', dueDay: 20 },
    { type: 'despesa', name: 'Plano de saúde', amount: 42000, category: 'saude', dueDay: 8 },
    { type: 'despesa', name: 'Streaming', amount: 5590, category: 'assinaturas', dueDay: 12 },
    { type: 'despesa', name: 'Academia', amount: 9990, category: 'saude', dueDay: 25 },
  ].map((r) => ({ ...r, id: uid(), startMonth: months[0], endMonth: null, installments: null, payment: 'Pix', notes: '' }));
  recs.push({ id: uid(), type: 'despesa', name: 'Celular novo', amount: 25000, category: 'compras', dueDay: 18,
    startMonth: months[2], installments: 10, endMonth: addMonths(months[2], 9), payment: 'Crédito', notes: '' });
  s.recurring = recs;

  const variable = [
    ['Mercado', 'mercado', 15000, 45000, 4],
    ['iFood', 'restaurantes', 3500, 9000, 4],
    ['Uber', 'transporte', 1500, 4500, 5],
    ['Combustível', 'transporte', 15000, 25000, 2],
    ['Farmácia', 'saude', 2000, 9000, 1],
    ['Cinema', 'lazer', 4000, 9000, 1],
    ['Roupas', 'compras', 8000, 25000, 1],
  ];
  const pays = ['Pix', 'Débito', 'Crédito'];
  for (const m of months) {
    const last = m === cm ? Number(today.slice(8, 10)) : 28;
    for (const r of recs) {
      if (m < r.startMonth || (r.endMonth && m > r.endMonth)) continue;
      if (m === cm && r.dueDay > last) continue;
      const day = String(Math.min(r.dueDay, last)).padStart(2, '0');
      const amount = r.category === 'contas-casa' && r.name.includes('luz') ? rnd(14000, 23000) : r.amount;
      s.transactions.push({ id: uid(), type: r.type, amount, date: `${m}-${day}`, description: r.name, category: r.category,
        payment: r.payment, notes: '', recurringId: r.id, recurringMonth: m });
    }
    for (const [desc, cat, min, max, times] of variable) {
      for (let i = 0; i < times; i++) {
        const day = String(rnd(1, last)).padStart(2, '0');
        s.transactions.push({ id: uid(), type: 'despesa', amount: rnd(min, max), date: `${m}-${day}`, description: desc,
          category: cat, payment: pays[rnd(0, 2)], notes: '', recurringId: null, recurringMonth: null });
      }
    }
    if (Math.random() > 0.5) {
      s.transactions.push({ id: uid(), type: 'receita', amount: rnd(30000, 120000), date: `${m}-${String(rnd(1, last)).padStart(2, '0')}`,
        description: 'Projeto freelance', category: 'freelance', payment: 'Pix', notes: '', recurringId: null, recurringMonth: null });
    }
  }
  s.settings.savingsGoal = s.settings.savingsGoal || 50000;
  state = s;
  persist();
}
