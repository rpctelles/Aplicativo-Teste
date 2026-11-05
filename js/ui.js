// Componentes de interface: painel inferior (sheet), confirmação e avisos (toast).

const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
const content = document.getElementById('sheet-content');
let sheetOpen = false;
let onCloseCb = null;

/** Abre (ou troca o conteúdo do) painel inferior. O botão "voltar" do Android fecha o painel. */
export function openSheet(html, { onClose } = {}) {
  content.innerHTML = html;
  content.scrollTop = 0;
  onCloseCb = onClose || null;
  if (!sheetOpen) {
    history.pushState({ sheet: true }, '');
    sheetOpen = true;
    sheet.hidden = false;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  const first = content.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 250);
  return content;
}

function hideSheet() {
  sheetOpen = false;
  sheet.hidden = true;
  backdrop.hidden = true;
  content.innerHTML = '';
  document.body.style.overflow = '';
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
  const rs = closeResolvers;
  closeResolvers = [];
  rs.forEach((r) => r());
}

let closeResolvers = [];
/** Fecha o painel. Retorna uma Promise resolvida quando o painel já foi fechado. */
export function closeSheet() {
  if (!sheetOpen) return Promise.resolve();
  return new Promise((resolve) => {
    closeResolvers.push(resolve);
    if (closeResolvers.length === 1) history.back(); // dispara popstate -> hideSheet
  });
}

export const isSheetOpen = () => sheetOpen;

window.addEventListener('popstate', () => {
  if (sheetOpen) hideSheet();
});
backdrop.addEventListener('click', closeSheet);

// ---------- Confirmação ----------
const dlg = document.getElementById('confirm-dialog');
export function confirmDialog(title, text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    dlg.querySelector('#confirm-title').textContent = title;
    dlg.querySelector('#confirm-text').textContent = text;
    const okBtn = dlg.querySelector('#confirm-ok');
    okBtn.textContent = ok;
    okBtn.className = danger ? 'btn btn-danger' : 'btn';
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer;
export function toast(msg, { action, onAction, duration = 3200 } = {}) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  toastEl.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.onclick = () => { toastEl.hidden = true; onAction?.(); };
    toastEl.appendChild(b);
  }
  toastEl.hidden = false;
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  toastEl.style.display = '';
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, action ? Math.max(duration, 5000) : duration);
}

export const ICONS = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  chevron: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9h6v6H9z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};
