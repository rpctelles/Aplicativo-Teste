// Gráficos (Chart.js, carregado localmente para funcionar offline).
import { money, moneyCompact } from './utils.js';

const instances = new Map();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function baseOptions() {
  const text = css('--text-2');
  const grid = css('--border');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: text, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 12 } } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${money(Math.round(c.raw * 100))}` } },
    },
    scales: {
      x: { ticks: { color: text, font: { size: 11 } }, grid: { display: false }, border: { color: grid } },
      y: { ticks: { color: text, font: { size: 11 }, callback: (v) => moneyCompact(v * 100) }, grid: { color: grid }, border: { display: false } },
    },
  };
}

function render(canvas, config) {
  if (!window.Chart || !canvas) return null;
  destroy(canvas.id);
  const chart = new window.Chart(canvas, config);
  instances.set(canvas.id, chart);
  return chart;
}

export function destroy(id) {
  const c = instances.get(id);
  if (c) { c.destroy(); instances.delete(id); }
}
export function destroyAll() {
  instances.forEach((c) => c.destroy());
  instances.clear();
}

const toReais = (cents) => Math.round(cents) / 100;

export function doughnut(canvas, items) {
  return render(canvas, {
    type: 'doughnut',
    data: {
      labels: items.map((i) => i.label),
      datasets: [{ data: items.map((i) => toReais(i.value)), backgroundColor: items.map((i) => i.color), borderColor: css('--surface'), borderWidth: 2, hoverOffset: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(Math.round(c.raw * 100))}` } },
      },
    },
  });
}

export function incomeExpenseBars(canvas, labels, income, expense, balance) {
  const o = baseOptions();
  return render(canvas, {
    data: {
      labels,
      datasets: [
        { type: 'line', label: 'Saldo', data: balance.map(toReais), borderColor: css('--primary'), backgroundColor: css('--primary'), tension: 0.3, pointRadius: 3, borderWidth: 2, order: 0 },
        { type: 'bar', label: 'Receitas', data: income.map(toReais), backgroundColor: css('--income'), borderRadius: 6, maxBarThickness: 22, order: 1 },
        { type: 'bar', label: 'Despesas', data: expense.map(toReais), backgroundColor: css('--expense'), borderRadius: 6, maxBarThickness: 22, order: 1 },
      ],
    },
    options: o,
  });
}

export function stackedBars(canvas, labels, sets) {
  const o = baseOptions();
  o.scales.x.stacked = true;
  o.scales.y.stacked = true;
  return render(canvas, {
    type: 'bar',
    data: { labels, datasets: sets.map((s) => ({ label: s.label, data: s.data.map(toReais), backgroundColor: s.color, borderRadius: 4, maxBarThickness: 26 })) },
    options: o,
  });
}

export function lineChart(canvas, labels, data, label) {
  const o = baseOptions();
  o.plugins.legend.display = false;
  const color = css('--primary');
  return render(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label, data: data.map(toReais), borderColor: color, borderWidth: 2.5, tension: 0.3, pointRadius: 3, fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          if (!chart.chartArea) return 'transparent';
          const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
          g.addColorStop(0, color + '55');
          g.addColorStop(1, color + '00');
          return g;
        },
      }],
    },
    options: o,
  });
}
