// Cálculos financeiros: resumo do mês, contas fixas do mês, séries para gráficos.
import { getState, paymentFor, category } from './store.js';
import { dateInMonth, monthOf, monthsBetween, todayISO, currentMonth, daysInMonth, daysBetween, addMonths, sum } from './utils.js';

export const txOfMonth = (month) => getState().transactions.filter((t) => monthOf(t.date) === month);

/** A conta fixa vale para este mês? */
export const recurringActiveIn = (r, month) => month >= r.startMonth && (!r.endMonth || month <= r.endMonth);

/** Instâncias das contas fixas em um mês, com status de pagamento. */
export function recurringForMonth(month) {
  const today = todayISO();
  return getState()
    .recurring.filter((r) => recurringActiveIn(r, month))
    .map((r) => {
      const tx = paymentFor(r.id, month);
      const dueDate = dateInMonth(month, r.dueDay);
      const paid = !!tx;
      const daysToDue = daysBetween(today, dueDate);
      let status = 'pending';
      if (paid) status = 'paid';
      else if (daysToDue < 0) status = 'late';
      else if (daysToDue <= 3) status = 'soon';
      const installmentNo = r.installments ? monthsBetween(r.startMonth, month) + 1 : null;
      return { rec: r, month, tx, paid, dueDate, daysToDue, status, amount: paid ? tx.amount : r.amount, installmentNo };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.rec.name.localeCompare(b.rec.name));
}

/** Saldo acumulado antes do início do mês (saldo inicial + tudo que entrou − tudo que saiu). */
export function balanceBefore(month) {
  const s = getState();
  let bal = s.settings.initialBalance || 0;
  for (const t of s.transactions) {
    if (monthOf(t.date) < month) bal += t.type === 'receita' ? t.amount : -t.amount;
  }
  return bal;
}

/** Resumo completo de um mês. Valores em centavos. */
export function monthSummary(month) {
  const s = getState();
  const txs = txOfMonth(month);
  const recs = recurringForMonth(month);

  const incomeReceived = sum(txs.filter((t) => t.type === 'receita'), (t) => t.amount);
  const expensePaid = sum(txs.filter((t) => t.type === 'despesa'), (t) => t.amount);

  const recIncome = recs.filter((i) => i.rec.type === 'receita');
  const recExpense = recs.filter((i) => i.rec.type === 'despesa');
  const incomePending = sum(recIncome.filter((i) => !i.paid), (i) => i.amount);
  const fixedPending = sum(recExpense.filter((i) => !i.paid), (i) => i.amount);
  const fixedPaid = sum(recExpense.filter((i) => i.paid), (i) => i.amount);
  const fixedTotal = fixedPaid + fixedPending;

  const variableExpense = expensePaid - fixedPaid;
  const expectedIncome = incomeReceived + incomePending;
  const expectedExpense = expensePaid + fixedPending;
  const savingsGoal = s.settings.savingsGoal || 0;
  const carry = s.settings.carryOver ? balanceBefore(month) : 0;

  const projected = expectedIncome - expectedExpense; // saldo previsto no fim do mês
  const free = carry + projected - savingsGoal; // livre para gastar

  // Orçamento diário: apenas para o mês atual / futuro
  const cm = currentMonth();
  let daysLeft = null;
  if (month === cm) daysLeft = daysInMonth(month) - Number(todayISO().slice(8, 10)) + 1;
  else if (month > cm) daysLeft = daysInMonth(month);
  const perDay = daysLeft && free > 0 ? Math.floor(free / daysLeft) : 0;

  const lateCount = recs.filter((i) => i.status === 'late' && i.rec.type === 'despesa').length;

  return {
    month, txs, recs,
    incomeReceived, expensePaid, incomePending, fixedPending, fixedPaid, fixedTotal,
    variableExpense, expectedIncome, expectedExpense, savingsGoal, carry,
    projected, free, perDay, daysLeft, lateCount,
    balance: incomeReceived - expensePaid,
    accumulated: balanceBefore(addMonths(month, 1)),
  };
}

/** Totais por categoria (despesas realizadas) em um conjunto de meses. */
export function byCategory(months, type = 'despesa') {
  const set = new Set(months);
  const map = new Map();
  for (const t of getState().transactions) {
    if (t.type !== type || !set.has(monthOf(t.date))) continue;
    map.set(t.category, (map.get(t.category) || 0) + t.amount);
  }
  const total = sum([...map.values()]);
  return [...map.entries()]
    .map(([id, value]) => ({ cat: category(id), value, pct: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Série mensal para relatórios. */
export function monthlySeries(months) {
  const txs = getState().transactions;
  return months.map((m) => {
    const list = txs.filter((t) => monthOf(t.date) === m);
    const income = sum(list.filter((t) => t.type === 'receita'), (t) => t.amount);
    const expense = sum(list.filter((t) => t.type === 'despesa'), (t) => t.amount);
    const fixed = sum(list.filter((t) => t.type === 'despesa' && t.recurringId), (t) => t.amount);
    return { month: m, income, expense, fixed, variable: expense - fixed, balance: income - expense, accumulated: balanceBefore(addMonths(m, 1)) };
  });
}

export const lastMonths = (endMonth, n) => Array.from({ length: n }, (_, i) => addMonths(endMonth, i - n + 1));
