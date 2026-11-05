// Exportação: Excel (.xlsx), CSV e backup (.json).
import { getState, category } from './store.js';
import { recurringForMonth, monthlySeries, byCategory } from './calc.js';
import { monthOf, monthLong, todayISO, addMonths, monthsBetween, currentMonth } from './utils.js';

let xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.mini.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxPromise = null; reject(new Error('Não foi possível carregar o gerador de Excel.')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

/** Baixa o arquivo; se o aparelho permitir, oferece compartilhar (WhatsApp, Drive, e-mail...). */
export async function deliverFile(blob, filename, { share = false } = {}) {
  if (share && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/** Lista de meses (YYYY-MM) conforme o período escolhido. */
export function periodMonths(period, refMonth) {
  const s = getState();
  if (period === 'month') return [refMonth];
  if (period === 'year') {
    const y = refMonth.slice(0, 4);
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  }
  // tudo: do primeiro lançamento/conta fixa até o mês atual (ou o último lançamento)
  const months = [...s.transactions.map((t) => monthOf(t.date)), ...s.recurring.map((r) => r.startMonth)];
  if (!months.length) return [refMonth];
  months.sort();
  const first = months[0];
  const last = [months[months.length - 1], currentMonth()].sort()[1];
  const n = monthsBetween(first, last) + 1;
  return Array.from({ length: n }, (_, i) => addMonths(first, i));
}

const BRL_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const money = (cents) => Math.round(cents) / 100;
/** Data ISO -> número de série do Excel (evita problemas de fuso horário). */
const excelDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

function sheetFromRows(XLSX, rows, { widths, moneyCols = [], dateCols = [], pctCols = [] } = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of moneyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === 'n') cell.z = BRL_FMT;
    }
    for (const C of dateCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && (cell.t === 'd' || cell.t === 'n')) cell.z = 'dd/mm/yyyy';
    }
    for (const C of pctCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === 'n') cell.z = '0.0%';
    }
  }
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, range.e.r), c: range.e.c } }) };
  return ws;
}

export async function exportExcel(period, refMonth) {
  const XLSX = await loadXLSX();
  const s = getState();
  const months = periodMonths(period, refMonth);
  const set = new Set(months);
  const wb = XLSX.utils.book_new();

  // 1) Resumo mensal
  const series = monthlySeries(months);
  const resumo = [['Mês', 'Receitas', 'Despesas', 'Contas fixas', 'Gastos variáveis', 'Saldo do mês', 'Taxa de economia', 'Saldo acumulado']];
  for (const r of series) {
    resumo.push([monthLong(r.month), money(r.income), money(r.expense), money(r.fixed), money(r.variable), money(r.balance),
      r.income ? r.balance / r.income : 0, money(r.accumulated)]);
  }
  const tot = series.reduce((a, r) => ({ income: a.income + r.income, expense: a.expense + r.expense, fixed: a.fixed + r.fixed, variable: a.variable + r.variable }),
    { income: 0, expense: 0, fixed: 0, variable: 0 });
  resumo.push(['TOTAL', money(tot.income), money(tot.expense), money(tot.fixed), money(tot.variable), money(tot.income - tot.expense),
    tot.income ? (tot.income - tot.expense) / tot.income : 0, '']);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, resumo, { widths: [20, 14, 14, 14, 16, 14, 16, 16], moneyCols: [1, 2, 3, 4, 5, 7], pctCols: [6] }), 'Resumo mensal');

  // 2) Lançamentos
  const txs = s.transactions.filter((t) => set.has(monthOf(t.date))).sort((a, b) => a.date.localeCompare(b.date));
  const lanc = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Valor (+/−)', 'Forma de pagamento', 'Conta fixa?', 'Observações']];
  for (const t of txs) {
    lanc.push([excelDate(t.date), t.type === 'receita' ? 'Receita' : 'Despesa', t.description || category(t.category).name,
      category(t.category).name, money(t.amount), money(t.type === 'receita' ? t.amount : -t.amount), t.payment || '',
      t.recurringId ? 'Sim' : 'Não', t.notes || '']);
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, lanc, { widths: [12, 10, 30, 22, 14, 14, 18, 11, 30], moneyCols: [4, 5], dateCols: [0] }), 'Lançamentos');

  // 3) Despesas por categoria x mês
  const cats = byCategory(months, 'despesa');
  const header = ['Categoria', ...months.map(monthLong), 'Total', '% do total'];
  const catRows = [header];
  for (const c of cats) {
    const row = [c.cat.name];
    for (const m of months) {
      row.push(money(txs.filter((t) => t.type === 'despesa' && t.category === c.cat.id && monthOf(t.date) === m).reduce((a, t) => a + t.amount, 0)));
    }
    row.push(money(c.value), c.pct);
    catRows.push(row);
  }
  const mc = Array.from({ length: months.length + 1 }, (_, i) => i + 1);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, catRows, { widths: [22, ...months.map(() => 15), 15, 11], moneyCols: mc, pctCols: [months.length + 2] }), 'Por categoria');

  // 4) Contas fixas (situação em cada mês do período)
  const fixas = [['Mês', 'Conta', 'Tipo', 'Categoria', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Parcela']];
  for (const m of months) {
    for (const i of recurringForMonth(m)) {
      fixas.push([monthLong(m), i.rec.name, i.rec.type === 'receita' ? 'Receita' : 'Despesa', category(i.rec.category).name,
        excelDate(i.dueDate), money(i.amount), i.paid ? (i.rec.type === 'receita' ? 'Recebido' : 'Pago') : i.status === 'late' ? 'Atrasado' : 'Pendente',
        i.tx ? excelDate(i.tx.date) : '', i.installmentNo ? `${i.installmentNo}/${i.rec.installments}` : '']);
    }
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, fixas, { widths: [20, 26, 10, 22, 12, 14, 12, 12, 9], moneyCols: [5], dateCols: [4, 7] }), 'Contas fixas');

  // 5) Cadastro de contas fixas
  const cad = [['Conta', 'Tipo', 'Categoria', 'Valor previsto', 'Dia do vencimento', 'Início', 'Fim', 'Parcelas', 'Forma de pagamento', 'Observações']];
  for (const r of s.recurring) {
    cad.push([r.name, r.type === 'receita' ? 'Receita' : 'Despesa', category(r.category).name, money(r.amount), r.dueDay,
      monthLong(r.startMonth), r.endMonth ? monthLong(r.endMonth) : 'Sem prazo', r.installments || '', r.payment || '', r.notes || '']);
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, cad, { widths: [26, 10, 22, 15, 10, 18, 18, 9, 18, 30], moneyCols: [3] }), 'Cadastro fixas');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const suffix = period === 'month' ? refMonth : period === 'year' ? refMonth.slice(0, 4) : 'completo';
  return { blob, filename: `financas-${suffix}-${todayISO()}.xlsx` };
}

/** CSV no padrão brasileiro (separador ";" e vírgula decimal) — abre direto no Excel. */
export function exportCSV(period, refMonth) {
  const s = getState();
  const set = new Set(periodMonths(period, refMonth));
  const q = (v) => {
    const str = String(v ?? '');
    return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const num = (c) => (c / 100).toFixed(2).replace('.', ',');
  const lines = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Forma de pagamento', 'Conta fixa', 'Observações'].join(';')];
  s.transactions
    .filter((t) => set.has(monthOf(t.date)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => {
      lines.push([`${t.date.slice(8, 10)}/${t.date.slice(5, 7)}/${t.date.slice(0, 4)}`, t.type === 'receita' ? 'Receita' : 'Despesa',
        t.description, category(t.category).name, num(t.type === 'receita' ? t.amount : -t.amount), t.payment,
        t.recurringId ? 'Sim' : 'Não', t.notes].map(q).join(';'));
    });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const suffix = period === 'month' ? refMonth : period === 'year' ? refMonth.slice(0, 4) : 'completo';
  return { blob, filename: `financas-${suffix}-${todayISO()}.csv` };
}

export function exportBackupFile(data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  return { blob, filename: `backup-financas-${todayISO()}.json` };
}
