// Utilitários gerais: dinheiro, datas, HTML.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

/** Valores são guardados em centavos (inteiros) para evitar erros de arredondamento. */
export const money = (cents) => brl.format((cents || 0) / 100);
export const moneyCompact = (cents) => brlCompact.format((cents || 0) / 100);
export const signedMoney = (cents, type) => (type === 'despesa' ? '− ' : '+ ') + money(Math.abs(cents));

/** Converte texto digitado ("1.234,56", "1234.56", "R$ 10") em centavos. Retorna NaN se inválido. */
export function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input || '').replace(/[R$\s]/g, '').trim();
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  } else if (/^\d{1,3}\.\d{3}$/.test(s)) {
    // "1.500" digitado como milhar
    s = s.replace('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Centavos -> texto para campo de edição ("1234,56"). */
export const centsToInput = (cents) => (cents ? (cents / 100).toFixed(2).replace('.', ',') : '');

// ---------- Datas ----------
const pad = (n) => String(n).padStart(2, '0');

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const currentMonth = () => todayISO().slice(0, 7);
export const monthOf = (iso) => iso.slice(0, 7);

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
/** Data ISO para um dia do mês, limitado ao último dia (ex.: dia 31 em fevereiro -> 28/29). */
export function dateInMonth(monthKey, day) {
  return `${monthKey}-${pad(Math.min(Math.max(1, day), daysInMonth(monthKey)))}`;
}

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const monthShortYFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

const toDate = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1);
};
const isoToDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const monthLabel = (k) => monthFmt.format(toDate(k)).replace(' de ', ' ');
export const monthLong = (k) => monthFmt.format(toDate(k));
export const monthShort = (k) => monthShortFmt.format(toDate(k)).replace('.', '');
export const monthShortYear = (k) => monthShortYFmt.format(toDate(k)).replace('.', '').replace(' de ', '/');
export const dayLabel = (iso) => {
  if (iso === todayISO()) return 'Hoje';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return 'Ontem';
  return dayFmt.format(isoToDate(iso));
};
export const dateBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const dateShort = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const isoToJSDate = isoToDate;

export function daysBetween(isoA, isoB) {
  return Math.round((isoToDate(isoB) - isoToDate(isoA)) / 86400000);
}

// ---------- Misc ----------
export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + fn(x), 0);

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
