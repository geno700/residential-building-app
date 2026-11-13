// Shared formatters, small hooks and dialog helpers.
import { html, useState, useEffect } from './lib.js';
import { config } from '../config.js';
import { t, has, locale } from './i18n.js';

export const EXPENSE_CATS = ['maintenance', 'elevator', 'cleaning', 'electricity', 'water', 'salaries', 'other'];
export const BILL_CATS = ['water', 'gas', 'electricity', 'other'];
export const STATUSES = ['open', 'progress', 'done'];

export const fmtNum = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
// Wrapped in left-to-right isolate marks so "240 EGP" keeps its order inside Arabic text.
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
export const money = (n, cur) => LRI + fmtNum(n) + (cur ? ' ' + cur : '') + PDI;

// Dates are stored as YYYY-MM-DD. Noon keeps them on the same day in every timezone.
const asDate = (iso) => new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
export const fmtDate = (iso) =>
  asDate(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMonth = (iso) => asDate(iso).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// People often type Arabic digits (٠-٩). Logins and amounts are stored with Latin ones.
export const latinDigits = (s) =>
  String(s ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// Database errors arrive as short codes (e.g. "wrong_login"); show the translated text when there is one.
export const errText = (err) => {
  const m = err?.message ?? String(err);
  return has('err.' + m) ? t('err.' + m) : m;
};

export const catLabel = (c) => (c ? (has('cat.' + c) ? t('cat.' + c) : c) : '');

export function entryTitle(e) {
  if (e.kind === 'due') return `${t('k.due')} · ${fmtMonth(e.month ?? e.entry_date)}`;
  if (e.kind === 'bill') return `${t('k.bill')}${e.category ? ' · ' + catLabel(e.category) : ''}`;
  if (e.kind === 'expense') return catLabel(e.category) || t('k.expense');
  return t('k.' + e.kind);
}

// What an apartment owes: positive = owes, negative = paid in advance.
const EPS = 0.004;
export const owedText = (v, cur) =>
  v > EPS ? t('owes', { n: money(v, cur) }) : v < -EPS ? t('advance', { n: money(-v, cur) }) : t('settled');
export const owedClass = (v) => (v > EPS ? 'low' : v < -EPS ? 'in' : '');

export const appBase = () => config.appUrl || location.origin + location.pathname;
export const residentLink = (code) => `${appBase()}?b=${encodeURIComponent(code)}`;

export function remember(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice is simply not remembered.
  }
}
export function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const go = (path) => {
  location.hash = path;
};

export function useRoute() {
  // Sign-in links put their own data after the #, which is not a page of this app.
  const read = () => (location.hash.startsWith('#/') ? location.hash.slice(1) : '/');
  const [route, setRoute] = useState(read());
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function toast(message, bad = false) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), bad ? 5000 : 2500);
}

// In-app question box. Browsers' own prompt() and confirm() are blocked in some places.
// With { input: true } it resolves to the typed text (null if cancelled); otherwise to true or false.
// With { info: true } it only shows a message and an OK button.
export function ask(message, { input = false, value = '', ok = t('ok'), danger = false, info = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const box = document.createElement('form');
    box.className = 'modal form ask';
    const text = document.createElement('p');
    text.textContent = message;
    box.append(text);
    let field = null;
    if (input) {
      field = document.createElement('input');
      field.value = value;
      field.setAttribute('aria-label', message);
      box.append(field);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const yes = document.createElement('button');
    yes.className = 'btn primary' + (danger ? ' danger-fill' : '');
    yes.textContent = ok;
    actions.append(yes);
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn';
    no.textContent = t('cancel');
    if (!info) actions.append(no);
    box.append(actions);
    overlay.append(box);

    const done = (result) => {
      removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };
    const cancel = () => done(input ? null : false);
    const onKey = (e) => e.key === 'Escape' && cancel();
    box.onsubmit = (e) => {
      e.preventDefault();
      done(input ? field.value : true);
    };
    no.onclick = cancel;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });
    addEventListener('keydown', onKey);
    document.body.append(overlay);
    (field ?? yes).focus();
    field?.select();
  });
}

// A form in a dialog. onSubmit may be async; errors it throws are shown inside the dialog.
export function Modal({ title, onClose, onSubmit, submitLabel, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }
  return html`
    <div class="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <form class="modal form" onSubmit=${submit}>
        <h2>${title}</h2>
        ${error && html`<p class="error">${error}</p>`} ${children}
        <div class="actions">
          <button class="btn primary" disabled=${busy}>${submitLabel ?? t('save')}</button>
          <button type="button" class="btn" onClick=${onClose}>${t('cancel')}</button>
        </div>
      </form>
    </div>
  `;
}

// Tell every loaded list on the page that money or apartments changed.
export const changed = () => dispatchEvent(new Event('data-changed'));

// Runs an async loader and tracks { data, error, loading }; reload() runs it again.
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (error) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    addEventListener('data-changed', again);
    return () => removeEventListener('data-changed', again);
  }, []);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

// One line of the ledger.
// mode 'unit': charges are plain, payments are green.  mode 'cash': money in is green, money out is orange.
export function EntryRow({ e, cur, mode = 'cash', showUnit = false, onDelete }) {
  let cls = '';
  let sign = '';
  if (mode === 'unit') {
    if (e.kind === 'payment' || e.kind === 'bill_payment') [cls, sign] = ['pos', '−'];
  } else if (e.kind === 'payment' || e.kind === 'income') [cls, sign] = ['pos', '+'];
  else if (e.kind === 'expense') [cls, sign] = ['neg', '−'];
  const sub = [fmtDate(e.entry_date), showUnit && e.unit_label ? t('apt', { n: e.unit_label }) : '', e.note]
    .filter(Boolean)
    .join(' · ');
  return html`
    <div class="row">
      <div class="main">
        <div class="title">${entryTitle(e)}</div>
        <div class="sub">${sub}</div>
      </div>
      <div class="delta ${cls}"><bdi>${sign}${money(e.amount, cur)}</bdi></div>
      ${onDelete &&
      html`<button class="btn small danger" title=${t('delete')} aria-label=${t('delete')} onClick=${() => onDelete(e)}>✕</button>`}
    </div>
  `;
}

export function Tile({ label, value, alert = false, good = false, hint }) {
  return html`
    <div class="card tile ${alert ? 'alert' : ''} ${good ? 'good' : ''}">
      <div class="label">${label}</div>
      <div class="value"><bdi>${value}</bdi></div>
      ${hint && html`<div class="hint">${hint}</div>`}
    </div>
  `;
}

export function Loading({ state }) {
  if (state.error) return html`<p class="state">${errText(state.error)}</p>`;
  return html`<p class="state">${t('loading')}</p>`;
}
