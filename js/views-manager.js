// Manager screens: home, apartments, money, maintenance, settings.
import { html, useState } from './lib.js';
import { db, demoMode } from './data.js';
import { t, LangButton } from './i18n.js';
import {
  EXPENSE_CATS, BILL_CATS, STATUSES, money, fmtDate, today, latinDigits, errText, catLabel, owedText, owedClass,
  residentLink, remember, go, useRoute, toast, ask, Modal, changed, useLoad, EntryRow, Tile, Loading, waLink, plain,
  downloadFile, fmtDateTime,
} from './ui.js';
import { Report } from './views-report.js';

// A balance as typed into a field: no thousands separators, at most two decimals.
const asInput = (n) => String(Math.round(Number(n ?? 0) * 100) / 100);

const CURRENT_KEY = 'building-fund-current';
export const lastBuilding = () => {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
};
function switchBuilding(id) {
  remember(CURRENT_KEY, id);
  location.hash = '#/';
  location.reload();
}

const numberInput = (value, onInput, extra = {}) =>
  html`<input inputmode="decimal" dir="ltr" value=${value} onInput=${(e) => onInput(latinDigits(e.target.value))} ...${extra} />`;

// ---------------------------------------------------------------- first building

export function CreateBuilding({ onDone, onCancel }) {
  const [f, setF] = useState({ name: '', floors: '11', perFloor: '2', fee: '120', currency: 'EGP', coded: 'yes' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const total = (Number(f.floors) || 0) * (Number(f.perFloor) || 0);
  // The same naming rule as the database: F1 / F1-R, F1-L / F1-1, F1-2 ...
  const per = Number(f.perFloor) || 0;
  const example = per <= 1 ? 'F1, F2, F3 …' : per === 2 ? 'F1-R, F1-L, F2-R …' : 'F1-1, F1-2, F1-3 …';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await db.createBuilding({
        name: f.name, floors: Number(f.floors), perFloor: Number(f.perFloor), fee: Number(f.fee), currency: f.currency,
        coded: f.coded === 'yes',
      });
      remember(CURRENT_KEY, res.building.id);
      onDone(res);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return html`
    <form class="card pad form" onSubmit=${submit}>
      <h1>${t('new_building')}</h1>
      <p class="muted small">${t('new_building_hint')}</p>
      ${error && html`<p class="error">${error}</p>`}
      <label><span>${t('building_name')}</span><input required maxlength="80" value=${f.name} onInput=${(e) => set('name')(e.target.value)} /></label>
      <div class="grid2">
        <label><span>${t('floors')}</span>${numberInput(f.floors, set('floors'), { required: true, inputmode: 'numeric' })}</label>
        <label><span>${t('per_floor')}</span>${numberInput(f.perFloor, set('perFloor'), { required: true, inputmode: 'numeric' })}</label>
      </div>
      <div class="grid2">
        <label><span>${t('monthly_fee')}</span>${numberInput(f.fee, set('fee'), { required: true })}</label>
        <label><span>${t('currency')}</span><input maxlength="8" value=${f.currency} onInput=${(e) => set('currency')(e.target.value)} /></label>
      </div>
      <label>
        <span>${t('numbering')}</span>
        <select value=${f.coded} onChange=${(e) => set('coded')(e.target.value)}>
          <option value="yes">${t('numbering_coded', { x: example })}</option>
          <option value="no">${t('numbering_plain')}</option>
        </select>
      </label>
      <p class="muted small">${t('new_building_total', { n: total })}</p>
      <div class="actions">
        <button class="btn primary" disabled=${busy}>${t('create_building')}</button>
        ${onCancel && html`<button type="button" class="btn" onClick=${onCancel}>${t('cancel')}</button>`}
      </div>
    </form>
  `;
}

// List of apartment passwords, shown once after they are created or replaced.
export function AccessSheet({ sheet, onClose }) {
  const link = residentLink(sheet.building.code);
  return html`
    <main class="sheet">
      <div class="page-head no-print">
        <h1>${t('sheet_title')}</h1>
        <div class="actions">
          <button class="btn primary" onClick=${() => print()}>${t('print')}</button>
          <button class="btn" onClick=${onClose}>${t('done')}</button>
        </div>
      </div>
      <p class="error no-print">${t('sheet_warning')}</p>
      <div class="card pad" style="margin:14px 0">
        <h2>${sheet.building.name}</h2>
        <p class="small">${t('sheet_how')}</p>
        <p><bdi class="mono">${link}</bdi></p>
        <p class="small">${t('building_code')}: <bdi class="mono">${sheet.building.code}</bdi></p>
      </div>
      <div class="slips">
        ${sheet.passwords.map(
          (p) => html`
            <div class="slip">
              <div><span class="muted">${t('apartment')}</span> <b><bdi>${p.label}</bdi></b>${p.floor != null && html` <span class="muted">· ${t('floor_n', { n: p.floor })}</span>`}</div>
              <div><span class="muted">${t('password')}</span> <b class="mono"><bdi>${p.password}</bdi></b></div>
            </div>
          `,
        )}
      </div>
    </main>
  `;
}

// ---------------------------------------------------------------- recording money

const ENTRY_TITLES = {
  payment: 'record_payment', bill: 'add_bill', bill_payment: 'record_bill_payment', expense: 'add_expense', income: 'add_income',
  extra: 'add_extra',
};

function EntryForm({ building, units, preset, onClose }) {
  const kind = preset.kind;
  const forUnit = ['payment', 'bill', 'bill_payment', 'extra'].includes(kind);
  const cats = kind === 'bill' ? BILL_CATS : kind === 'expense' ? EXPENSE_CATS : null;
  const first = units.find((u) => u.id === preset.unit_id) ?? null;
  const suggest = (u) =>
    !u ? '' : kind === 'payment' ? String(u.dues > 0 ? u.dues : u.monthly_fee || '') : kind === 'bill_payment' && u.bills > 0 ? String(u.bills) : '';
  const [f, setF] = useState({
    unit_id: first?.id ?? (kind === 'extra' ? 'all' : ''), amount: suggest(first), entry_date: today(),
    category: cats?.[0] ?? '', note: '',
  });
  const unit = units.find((u) => u.id === f.unit_id);
  const cur = building.currency;

  async function submit() {
    if (!(Number(f.amount) > 0)) throw new Error('bad_amount');
    const entry = { ...f, kind, amount: Number(f.amount) };
    // An extra fee can go to every apartment at once.
    if (f.unit_id === 'all') await db.addEntries(building.id, units.map((u) => ({ ...entry, unit_id: u.id })));
    else await db.addEntry(building.id, entry);
    changed();
    toast(t('saved'));
    onClose();
  }

  return html`
    <${Modal} title=${t(ENTRY_TITLES[kind])} onClose=${onClose} onSubmit=${submit}>
      ${kind === 'bill' && html`<p class="muted small">${t('bill_hint')}</p>`}
      ${kind === 'extra' && html`<p class="muted small">${t('extra_hint')}</p>`}
      ${forUnit &&
      html`<label>
        <span>${t('apartment')}</span>
        <select required value=${f.unit_id}
          onChange=${(e) => {
            const u = units.find((x) => x.id === e.target.value);
            setF({ ...f, unit_id: e.target.value, amount: suggest(u) });
          }}>
          ${kind === 'extra'
            ? html`<option value="all">${t('all_apartments', { n: units.length })}</option>`
            : html`<option value="">${t('choose')}</option>`}
          ${units.map((u) => html`<option value=${u.id}>${u.label}${u.resident_name ? ' · ' + u.resident_name : ''}</option>`)}
        </select>
      </label>`}
      ${unit && kind === 'payment' && html`<p class="small muted">${t('fees')}: ${owedText(unit.dues, cur)}</p>`}
      ${unit && kind === 'bill_payment' && html`<p class="small muted">${t('bills')}: ${owedText(unit.bills, cur)}</p>`}
      ${cats &&
      html`<label>
        <span>${kind === 'bill' ? t('bill_type') : t('category')}</span>
        <select value=${f.category} onChange=${(e) => setF({ ...f, category: e.target.value })}>
          ${cats.map((c) => html`<option value=${c}>${catLabel(c)}</option>`)}
        </select>
      </label>`}
      <div class="grid2">
        <label><span>${t('amount')} (${cur})</span>${numberInput(f.amount, (v) => setF({ ...f, amount: v }), { required: true })}</label>
        <label><span>${t('date')}</span><input type="date" required value=${f.entry_date} onInput=${(e) => setF({ ...f, entry_date: e.target.value })} /></label>
      </div>
      <label>
        <span>${kind === 'extra' ? t('extra_what') : t('note')}</span>
        <input maxlength="200" required=${kind === 'extra'} value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })} />
      </label>
    <//>
  `;
}

async function removeEntry(e) {
  if (!(await ask(t('confirm_delete_entry'), { ok: t('delete'), danger: true }))) return;
  try {
    await db.deleteEntry(e.id);
    changed();
    toast(t('deleted'));
  } catch (err) {
    toast(errText(err), true);
  }
}

// ---------------------------------------------------------------- pages

function Home({ building, ov, openEntry }) {
  const cur = building.currency;
  const s = ov.summary;
  const recent = useLoad(
    () => db.listEntries(building.id, { kinds: ['payment', 'income', 'expense', 'bill', 'bill_payment'], limit: 8 }),
    [building.id],
  );
  const late = ov.units.filter((u) => u.dues + u.bills > 0.004).sort((a, b) => b.dues + b.bills - (a.dues + a.bills)).slice(0, 5);

  return html`
    <div class="tiles">
      <${Tile} label=${t('building_balance')} value=${money(s.cash, cur)} alert=${s.cash < 0} />
      <${Tile} label=${t('unpaid_fees')} value=${money(s.dues_owed, cur)} alert=${s.dues_owed > 0} />
      <${Tile} label=${t('paid_ahead')} value=${money(s.advance, cur)} />
      <${Tile} label=${t('bills_owed_to_you')} value=${money(s.bills_owed, cur)} hint=${t('your_pocket')} />
    </div>

    <div class="stock-actions">
      <button class="btn primary big" onClick=${() => openEntry({ kind: 'payment' })}>${t('record_payment')}</button>
      <button class="btn big" onClick=${() => openEntry({ kind: 'expense' })}>${t('add_expense')}</button>
      <button class="btn big" onClick=${() => openEntry({ kind: 'bill' })}>${t('add_bill')}</button>
    </div>

    ${late.length > 0 &&
    html`<div class="section">
      <h2>${t('owe_most')}</h2>
      <div class="card list">
        ${late.map((u) => html`<${UnitRow} u=${u} cur=${cur} />`)}
      </div>
    </div>`}

    <div class="section">
      <h2>${t('recent')}</h2>
      ${recent.data
        ? html`<div class="card list">
            ${recent.data.length === 0 && html`<p class="empty">${t('nothing_yet')}</p>`}
            ${recent.data.map((e) => html`<${EntryRow} e=${e} cur=${cur} showUnit />`)}
          </div>`
        : html`<${Loading} state=${recent} />`}
    </div>
  `;
}

function UnitRow({ u, cur }) {
  return html`
    <a class="row" href=${'#/units/' + u.id}>
      <div class="main">
        <div class="title">${t('apt', { n: u.label })}${u.resident_name ? ' · ' + u.resident_name : ''}</div>
        <div class="sub">
          ${[u.floor != null ? t('floor_n', { n: u.floor }) : '', t('fee_per_month', { n: money(u.monthly_fee, cur) })].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div class="badges">
        <span class="badge ${owedClass(u.dues)}">${owedText(u.dues, cur)}</span>
        ${Math.abs(u.bills) > 0.004 && html`<span class="badge ${u.bills > 0 ? 'adjust' : 'in'}">${t('bills')}: ${money(u.bills, cur)}</span>`}
      </div>
    </a>
  `;
}

// Every apartment in one table, to set names, phones, fees and balances quickly.
function BulkEdit({ building, ov }) {
  const start = (u) => ({
    id: u.id, resident_name: u.resident_name ?? '', phone: u.phone ?? '', monthly_fee: asInput(u.monthly_fee), balance: asInput(u.dues),
  });
  const [rows, setRows] = useState(() => ov.units.map(start));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    let done = 0;
    try {
      for (const r of rows) {
        const u = ov.units.find((x) => x.id === r.id);
        const was = start(u);
        const details = ['resident_name', 'phone', 'monthly_fee'].some((k) => r[k] !== was[k]);
        const balance = r.balance !== was.balance;
        if (!details && !balance) continue;
        if (details) await db.saveUnit(building.id, { ...u, ...r });
        // After the fee, so the balance typed here is the balance that results.
        if (balance) await db.setUnitBalance(u.id, Number(r.balance || 0));
        done++;
      }
      changed();
      toast(done ? t('n_saved', { n: done }) : t('nothing_changed'));
      if (done) go('/units');
    } catch (err) {
      changed();
      toast(errText(err), true);
    }
    setBusy(false);
  }

  return html`
    <a class="back" href="#/units">‹ ${t('apartments')}</a>
    <form onSubmit=${save}>
      <div class="page-head">
        <h1>${t('edit_all')}</h1>
        <button class="btn primary" disabled=${busy}>${t('save_all')}</button>
      </div>
      <p class="muted small" style="margin-bottom:12px">${t('edit_all_hint')}</p>
      <div class="card table-wrap">
        <table class="grid-edit">
          <thead>
            <tr>
              <th>${t('apartment')}</th><th>${t('resident_name')}</th><th>${t('phone')}</th>
              <th>${t('monthly_fee')}</th><th>${t('balance_now')} (${building.currency})</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const u = ov.units[i];
              return html`<tr>
                <td><b><bdi>${u.label}</bdi></b></td>
                <td><input maxlength="80" aria-label=${t('resident_name')} value=${r.resident_name} onInput=${(e) => set(i, 'resident_name', e.target.value)} /></td>
                <td><input maxlength="30" dir="ltr" inputmode="tel" aria-label=${t('phone')} value=${r.phone} onInput=${(e) => set(i, 'phone', e.target.value)} /></td>
                <td><input dir="ltr" inputmode="decimal" required pattern="[0-9]*[.]?[0-9]*" aria-label=${t('monthly_fee')} value=${r.monthly_fee}
                  onInput=${(e) => set(i, 'monthly_fee', latinDigits(e.target.value))} /></td>
                <td><input dir="ltr" pattern="-?[0-9]*[.]?[0-9]*" aria-label=${t('balance_now')} value=${r.balance}
                  onInput=${(e) => set(i, 'balance', latinDigits(e.target.value))} /></td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      <div class="actions" style="margin-top:14px"><button class="btn primary" disabled=${busy}>${t('save_all')}</button></div>
    </form>
  `;
}

function Units({ building, ov, onEdit, openEntry }) {
  const cur = building.currency;
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const needle = latinDigits(q).trim().toLowerCase();
  const list = ov.units.filter(
    (u) =>
      (filter === 'all' || (filter === 'owes' ? u.dues + u.bills > 0.004 : u.dues < -0.004)) &&
      (!needle || u.label.toLowerCase().includes(needle) || (u.resident_name ?? '').toLowerCase().includes(needle)),
  );
  const chip = (key, label) =>
    html`<button class="chip ${filter === key ? 'on' : ''}" onClick=${() => setFilter(key)}>${label}</button>`;

  return html`
    <div class="page-head">
      <h1>${t('apartments')} <span class="muted">(${ov.units.length})</span></h1>
      <div class="actions">
        <button class="btn" onClick=${() => openEntry({ kind: 'extra' })}>${t('add_extra')}</button>
        <a class="btn" href="#/units/edit">${t('edit_all')}</a>
        <button class="btn" onClick=${() => onEdit({})}>${t('add_apartment')}</button>
      </div>
    </div>
    <div class="filters">
      <input type="search" placeholder=${t('search_apartment')} value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="chips">${chip('all', t('all'))} ${chip('owes', t('f_owes'))} ${chip('ahead', t('f_ahead'))}</div>
    </div>
    <div class="card list">
      ${list.length === 0 && html`<p class="empty">${t('no_apartments')}</p>`}
      ${list.map((u) => html`<${UnitRow} u=${u} cur=${cur} />`)}
    </div>
  `;
}

function UnitDetail({ building, ov, id, openEntry, onEdit }) {
  const cur = building.currency;
  const u = ov.units.find((x) => x.id === id);
  const st = useLoad(() => db.listEntries(building.id, { unitId: id, limit: 500 }), [id]);
  if (!u) return html`<p class="state">${t('not_found')} <a href="#/units"><u>${t('apartments')}</u></a></p>`;

  async function password() {
    const typed = await ask(t('password_prompt', { n: u.label }), { input: true, ok: t('set_password') });
    if (typed === null) return;
    try {
      const pw = await db.setUnitPassword(u.id, latinDigits(typed));
      changed();
      await ask(t('password_is', { n: u.label, pw }), { info: true });
    } catch (err) {
      toast(errText(err), true);
    }
  }

  // WhatsApp chat with the resident, with their balance and their login details already typed in.
  const waFor = (pw) =>
    waLink(
      u.phone,
      t('wa_msg', {
        apt: u.label, building: building.name, status: plain(owedText(u.dues + u.bills, cur)), link: residentLink(building.code),
        code: building.code, pw,
      }),
    );
  const wa = u.phone && waFor(u.password ?? '');
  // A password set before the app started keeping them cannot be read, so a new one is made to send.
  async function sendNewPassword() {
    if (!(await ask(t('wa_no_password', { n: u.label }), { ok: t('wa_new_password') }))) return;
    try {
      const pw = await db.setUnitPassword(u.id, '');
      changed();
      const url = waFor(pw);
      const tab = window.open(url, '_blank');
      if (tab) tab.opener = null;
      else location.href = url;
    } catch (err) {
      toast(errText(err), true);
    }
  }

  return html`
    <a class="back" href="#/units">‹ ${t('apartments')}</a>
    <div class="page-head">
      <div>
        <h1>${t('apt', { n: u.label })}${u.resident_name ? ' · ' + u.resident_name : ''}</h1>
        <p class="muted small">
          ${[u.floor != null ? t('floor_n', { n: u.floor }) : '', t('fee_per_month', { n: money(u.monthly_fee, cur) }), u.phone].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div class="actions">
        ${wa &&
        (u.password
          ? html`<a class="btn small" href=${wa} target="_blank" rel="noopener">${t('whatsapp')}</a>`
          : html`<button class="btn small" onClick=${sendNewPassword}>${t('whatsapp')}</button>`)}
        <a class="btn small" href=${'#/report/' + u.id}>${t('statement_pdf')}</a>
        <button class="btn small" onClick=${() => onEdit(u)}>${t('edit')}</button>
        <button class="btn small" onClick=${password}>${t('password')}</button>
      </div>
    </div>
    ${u.password
      ? html`<p class="small" style="margin-bottom:12px">${t('login_details')}: <bdi class="mono"><b>${u.label}</b></bdi> · ${t('password')}: <bdi class="mono"><b>${u.password}</b></bdi></p>`
      : u.has_password && html`<p class="small muted" style="margin-bottom:12px">${t('password_hidden')}</p>`}

    <div class="tiles two">
      <${Tile} label=${t('fees')} value=${owedText(u.dues, cur)} alert=${u.dues > 0.004} good=${u.dues < -0.004} />
      <${Tile} label=${t('bills_paid_by_you')} value=${owedText(u.bills, cur)} alert=${u.bills > 0.004} />
    </div>
    ${!u.has_password && html`<p class="error" style="margin-top:12px">${t('no_password')}</p>`}

    <div class="stock-actions">
      <button class="btn primary big" onClick=${() => openEntry({ kind: 'payment', unit_id: u.id })}>${t('record_payment')}</button>
      <button class="btn big" onClick=${() => openEntry({ kind: 'bill', unit_id: u.id })}>${t('add_bill')}</button>
      <button class="btn big" onClick=${() => openEntry({ kind: 'bill_payment', unit_id: u.id })}>${t('record_bill_payment')}</button>
      <button class="btn big" onClick=${() => openEntry({ kind: 'extra', unit_id: u.id })}>${t('add_extra')}</button>
    </div>

    <div class="section">
      <h2>${t('statement')}</h2>
      ${st.data
        ? html`<div class="card list">
            ${st.data.length === 0 && !u.opening_balance && html`<p class="empty">${t('nothing_yet')}</p>`}
            ${st.data.map((e) => html`<${EntryRow} e=${e} cur=${cur} mode="unit" onDelete=${e.kind === 'due' ? null : removeEntry} />`)}
            ${u.opening_balance !== 0 &&
            html`<div class="row">
              <div class="main"><div class="title">${t('opening_balance')}</div><div class="sub">${t('opening_balance_sub')}</div></div>
              <div class="delta"><bdi>${money(u.opening_balance, cur)}</bdi></div>
            </div>`}
          </div>`
        : html`<${Loading} state=${st} />`}
    </div>
  `;
}

function UnitForm({ building, unit, onClose }) {
  const isNew = !unit.id;
  const [f, setF] = useState({
    id: unit.id, label: unit.label ?? '', floor: unit.floor ?? '', resident_name: unit.resident_name ?? '',
    phone: unit.phone ?? '', monthly_fee: String(unit.monthly_fee ?? 120), balance: asInput(unit.dues),
  });
  const set = (k) => (e) => setF({ ...f, [k]: typeof e === 'string' ? e : e.target.value });

  async function submit() {
    const id = await db.saveUnit(building.id, { ...f, label: latinDigits(f.label) });
    // Only when the balance was typed over: a changed fee alone must be allowed to move it.
    if (f.balance !== asInput(unit.dues)) await db.setUnitBalance(id, Number(f.balance || 0));
    changed();
    toast(t('saved'));
    onClose();
  }
  async function remove() {
    if (!(await ask(t('confirm_delete_apartment', { n: unit.label }), { ok: t('delete'), danger: true }))) return;
    try {
      await db.deleteUnit(unit.id);
      changed();
      onClose();
      go('/units');
    } catch (err) {
      toast(errText(err), true);
    }
  }

  return html`
    <${Modal} title=${isNew ? t('add_apartment') : t('edit_apartment')} onClose=${onClose} onSubmit=${submit}>
      <div class="grid2">
        <label><span>${t('apartment_number')}</span><input required maxlength="20" value=${f.label} onInput=${set('label')} /></label>
        <label><span>${t('floor')}</span>${numberInput(f.floor, set('floor'), { inputmode: 'numeric' })}</label>
      </div>
      <div class="grid2">
        <label><span>${t('resident_name')}</span><input maxlength="80" value=${f.resident_name} onInput=${set('resident_name')} /></label>
        <label><span>${t('phone')}</span><input maxlength="30" dir="ltr" inputmode="tel" value=${f.phone} onInput=${set('phone')} /></label>
      </div>
      <label><span>${t('monthly_fee')} (${building.currency})</span>${numberInput(f.monthly_fee, set('monthly_fee'), { required: true })}</label>
      <p class="muted small">${t('fee_hint')}</p>
      <label>
        <span>${t('balance_now')} (${building.currency})</span>
        <input dir="ltr" inputmode="text" value=${f.balance} onInput=${(e) => set('balance')(latinDigits(e.target.value))}
          pattern="-?[0-9]*[.]?[0-9]*" />
      </label>
      <p class="muted small">${t('balance_now_hint')}</p>
      ${!isNew && html`<button type="button" class="btn danger" onClick=${remove}>${t('delete_apartment')}</button>`}
    <//>
  `;
}

function Money({ building, ov, openEntry }) {
  const cur = building.currency;
  const s = ov.summary;
  const [tab, setTab] = useState('fund');
  const kinds = tab === 'fund' ? ['payment', 'income', 'expense'] : ['bill', 'bill_payment'];
  const list = useLoad(() => db.listEntries(building.id, { kinds, limit: 400 }), [building.id, tab]);
  const chip = (key, label) => html`<button class="chip ${tab === key ? 'on' : ''}" onClick=${() => setTab(key)}>${label}</button>`;

  return html`
    <div class="page-head">
      <h1>${t('money')}</h1>
      <div class="actions">
        <a class="btn" href="#/report">${t('report_pdf')}</a>
        <button class="btn" onClick=${() => openEntry({ kind: 'income' })}>${t('add_income')}</button>
        <button class="btn primary" onClick=${() => openEntry({ kind: 'expense' })}>${t('add_expense')}</button>
      </div>
    </div>
    <div class="tiles">
      <${Tile} label=${t('building_balance')} value=${money(s.cash, cur)} alert=${s.cash < 0} />
      <${Tile} label=${t('fees_collected')} value=${money(s.collected, cur)} />
      <${Tile} label=${t('other_income')} value=${money(s.income + s.opening_cash, cur)} hint=${s.opening_cash ? t('incl_opening', { n: money(s.opening_cash, cur) }) : ''} />
      <${Tile} label=${t('spent')} value=${money(s.spent, cur)} />
    </div>
    <div class="section">
      <div class="chips" style="margin-bottom:12px">${chip('fund', t('building_fund'))} ${chip('bills', t('bills_your_pocket'))}</div>
      ${tab === 'bills' && html`<p class="muted small" style="margin-bottom:10px">${t('bills_tab_hint', { n: money(s.bills_owed, cur) })}</p>`}
      ${list.data
        ? html`<div class="card list">
            ${list.data.length === 0 && html`<p class="empty">${t('nothing_yet')}</p>`}
            ${list.data.map((e) => html`<${EntryRow} e=${e} cur=${cur} showUnit onDelete=${removeEntry} />`)}
          </div>`
        : html`<${Loading} state=${list} />`}
    </div>
  `;
}

function Maintenance({ building }) {
  const list = useLoad(() => db.listMaintenance(building.id), [building.id]);
  const [edit, setEdit] = useState(null);

  return html`
    <div class="page-head">
      <h1>${t('maintenance')}</h1>
      <button class="btn primary" onClick=${() => setEdit({ title: '', details: '', status: 'open' })}>${t('add_job')}</button>
    </div>
    ${list.data
      ? html`<div class="card list">
          ${list.data.length === 0 && html`<p class="empty">${t('no_maintenance')}</p>`}
          ${list.data.map(
            (m) => html`
              <button class="row as-button" onClick=${() => setEdit(m)}>
                <div class="main">
                  <div class="title">${m.title}</div>
                  <div class="sub">
                    ${[fmtDate(m.created_at), m.unit_label ? t('reported_by', { n: m.unit_label }) : '', m.details].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span class="badge st-${m.status}">${t('st.' + m.status)}</span>
              </button>
            `,
          )}
        </div>`
      : html`<${Loading} state=${list} />`}
    ${edit && html`<${MaintenanceForm} building=${building} item=${edit} onClose=${() => setEdit(null)} />`}
  `;
}

function MaintenanceForm({ building, item, onClose }) {
  const [f, setF] = useState({ ...item, details: item.details ?? '' });
  async function submit() {
    await db.saveMaintenance(building.id, f);
    changed();
    toast(t('saved'));
    onClose();
  }
  async function remove() {
    if (!(await ask(t('confirm_delete_job'), { ok: t('delete'), danger: true }))) return;
    try {
      await db.deleteMaintenance(item.id);
      changed();
      onClose();
    } catch (err) {
      toast(errText(err), true);
    }
  }
  return html`
    <${Modal} title=${item.id ? t('edit_job') : t('add_job')} onClose=${onClose} onSubmit=${submit}>
      <label><span>${t('job_title')}</span><input required maxlength="120" value=${f.title} onInput=${(e) => setF({ ...f, title: e.target.value })} /></label>
      <label><span>${t('details')}</span><textarea maxlength="1000" value=${f.details} onInput=${(e) => setF({ ...f, details: e.target.value })}></textarea></label>
      <label>
        <span>${t('status')}</span>
        <select value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}>
          ${STATUSES.map((s) => html`<option value=${s}>${t('st.' + s)}</option>`)}
        </select>
      </label>
      ${item.id && html`<button type="button" class="btn danger" onClick=${remove}>${t('delete')}</button>`}
    <//>
  `;
}

// Who manages this building. Only the owner (who created it) adds or removes managers.
function Managers({ building }) {
  const list = useLoad(() => db.listManagers(building.id), [building.id]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await db.addManager(building.id, email.trim());
      setEmail('');
      list.reload();
      toast(t('saved'));
    } catch (err) {
      toast(errText(err), true);
    }
    setBusy(false);
  }
  async function remove(m) {
    if (!(await ask(t('confirm_remove_manager', { email: m.email }), { ok: t('remove'), danger: true }))) return;
    try {
      await db.removeManager(building.id, m.user_id);
      list.reload();
    } catch (err) {
      toast(errText(err), true);
    }
  }

  return html`
    <div class="card pad form section">
      <h2>${t('managers')}</h2>
      <p class="muted small">${t('managers_hint')}</p>
      ${list.data
        ? html`<div class="list">
            ${list.data.map(
              (m) => html`
                <div class="row" style="padding:10px 0">
                  <div class="main"><div class="title"><bdi>${m.email}</bdi></div></div>
                  ${m.owner
                    ? html`<span class="badge in">${t('owner')}</span>`
                    : building.owner && html`<button class="btn small danger" onClick=${() => remove(m)}>${t('remove')}</button>`}
                </div>
              `,
            )}
          </div>`
        : html`<${Loading} state=${list} />`}
      ${building.owner &&
      html`<form class="filters" style="margin:0" onSubmit=${add}>
        <input type="email" required dir="ltr" placeholder=${t('manager_email')} aria-label=${t('manager_email')} value=${email}
          onInput=${(e) => setEmail(e.target.value)} style="flex:1 1 200px" />
        <button class="btn" disabled=${busy}>${t('add_manager')}</button>
      </form>`}
    </div>
  `;
}

// Backups: a copy is saved automatically once a day; the manager can also save one, download it, or go back to one.
function Backups({ building }) {
  const list = useLoad(() => db.listBackups(building.id), [building.id]);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);

  const save = (data) =>
    downloadFile(`backup-${building.code}-${String(data.taken_at ?? '').slice(0, 10) || today()}.json`, JSON.stringify(data));
  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(errText(err), true);
    }
    setBusy(false);
  }
  const backupNow = () =>
    run(async () => {
      save(await db.backupNow(building.id));
      list.reload();
      toast(t('backup_saved'));
    });
  const download = (k) => run(async () => save(await db.getBackup(k.id)));

  async function restore(source, info) {
    const text = t('confirm_restore', { when: info.when ? fmtDateTime(info.when) : '?', units: info.units, entries: info.entries });
    if (!(await ask(text, { ok: t('restore'), danger: true }))) return;
    await run(async () => {
      await db.restoreBackup(building.id, source);
      await ask(t('restored'), { info: true });
      location.reload();
    });
  }
  async function fromFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data = null;
    try {
      data = JSON.parse(await file.text());
    } catch {
      // Not a backup file: reported just below.
    }
    if (data?.app !== 'residential-building-app' || !Array.isArray(data.units) || !Array.isArray(data.entries)) {
      return toast(t('err.bad_backup'), true);
    }
    restore({ data }, { when: data.taken_at, units: data.units.length, entries: data.entries.length });
  }

  const rows = list.data ? (all ? list.data : list.data.slice(0, 5)) : [];
  return html`
    <div class="card pad form section">
      <h2>${t('backups')}</h2>
      <p class="muted small">${t('backups_hint')}</p>
      <div class="actions">
        <button class="btn primary" disabled=${busy} onClick=${backupNow}>${t('backup_now')}</button>
        <button class="btn" disabled=${busy} onClick=${(e) => e.currentTarget.nextElementSibling.click()}>${t('restore_file')}</button>
        <input type="file" accept=".json,application/json" hidden onChange=${fromFile} />
      </div>
      ${list.data
        ? html`<div class="list">
            ${list.data.length === 0 && html`<p class="muted small">${t('no_backups')}</p>`}
            ${rows.map(
              (k) => html`
                <div class="row" style="padding:10px 0">
                  <div class="main">
                    <div class="title"><bdi>${fmtDateTime(k.created_at)}</bdi></div>
                    <div class="sub">${t('bk.' + k.kind)} · ${t('backup_counts', { units: k.units, entries: k.entries })}</div>
                  </div>
                  <div class="actions">
                    <button class="btn small" disabled=${busy} onClick=${() => download(k)}>${t('download')}</button>
                    <button class="btn small danger" disabled=${busy}
                      onClick=${() => restore({ id: k.id }, { when: k.created_at, units: k.units, entries: k.entries })}>${t('restore')}</button>
                  </div>
                </div>
              `,
            )}
            ${!all && list.data.length > rows.length &&
            html`<button class="btn small" onClick=${() => setAll(true)}>${t('show_all_n', { n: list.data.length })}</button>`}
          </div>`
        : html`<${Loading} state=${list} />`}
    </div>
  `;
}

function Settings({ building, buildings, session, refresh, showSheet }) {
  const [f, setF] = useState({ name: building.name, currency: building.currency, opening_cash: String(building.opening_cash) });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const link = residentLink(building.code);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await db.updateBuilding(building.id, { ...f, opening_cash: Number(f.opening_cash || 0) });
      toast(t('saved'));
      await refresh();
      changed();
    } catch (err) {
      toast(errText(err), true);
    }
    setBusy(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('copied'));
    } catch {
      await ask(link, { info: true });
    }
  }
  async function resetAll() {
    if (!(await ask(t('confirm_reset_all'), { ok: t('new_passwords'), danger: true }))) return;
    try {
      showSheet({ building, passwords: await db.resetAllPasswords(building.id) });
      changed();
    } catch (err) {
      toast(errText(err), true);
    }
  }
  async function removeBuilding() {
    const typed = await ask(t('confirm_delete_building', { name: building.name }), { input: true, ok: t('delete'), danger: true });
    if (typed === null) return;
    if (typed.trim() !== building.name) return toast(t('name_mismatch'), true);
    try {
      await db.deleteBuilding(building.id);
      remember(CURRENT_KEY, null);
      location.hash = '#/';
      location.reload();
    } catch (err) {
      toast(errText(err), true);
    }
  }

  async function rename(coded) {
    if (!(await ask(t('confirm_rename'), { ok: t('rename_apartments') }))) return;
    try {
      await db.relabelUnits(building.id, coded);
      changed();
      toast(t('saved'));
    } catch (err) {
      toast(errText(err), true);
    }
  }

  if (adding) {
    return html`<${CreateBuilding}
      onCancel=${() => setAdding(false)}
      onDone=${(res) => {
        showSheet(res);
        location.hash = '#/';
        refresh();
      }} />`;
  }

  return html`
    <div class="page-head"><h1>${t('settings')}</h1></div>

    <div class="card pad form">
      <h2>${t('resident_access')}</h2>
      <p class="muted small">${t('resident_access_hint')}</p>
      <p><bdi class="mono">${link}</bdi></p>
      <p class="small">${t('building_code')}: <bdi class="join-code">${building.code}</bdi></p>
      <div class="actions">
        <button class="btn" onClick=${copy}>${t('copy_link')}</button>
        <button class="btn" onClick=${resetAll}>${t('new_passwords_all')}</button>
      </div>
      <p class="muted small">${t('one_password_hint')}</p>
    </div>

    <form class="card pad form section" onSubmit=${save}>
      <h2>${t('building')}</h2>
      <label><span>${t('building_name')}</span><input required maxlength="80" value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} /></label>
      <div class="grid2">
        <label><span>${t('currency')}</span><input maxlength="8" value=${f.currency} onInput=${(e) => setF({ ...f, currency: e.target.value })} /></label>
        <label>
          <span>${t('opening_cash')}</span>
          <input dir="ltr" value=${f.opening_cash} pattern="-?[0-9]*[.]?[0-9]*" onInput=${(e) => setF({ ...f, opening_cash: latinDigits(e.target.value) })} />
        </label>
      </div>
      <p class="muted small">${t('opening_cash_hint')}</p>
      <div class="actions"><button class="btn primary" disabled=${busy}>${t('save')}</button></div>
    </form>

    <div class="card pad form section">
      <h2>${t('rename_apartments')}</h2>
      <p class="muted small">${t('rename_hint')}</p>
      <div class="actions">
        <button class="btn" onClick=${() => rename(true)}>${t('rename_coded')}</button>
        <button class="btn" onClick=${() => rename(false)}>${t('rename_plain')}</button>
      </div>
    </div>

    <${Backups} building=${building} />

    <${Managers} building=${building} />

    <div class="card pad form section">
      <h2>${t('your_buildings')}</h2>
      <div class="list">
        ${buildings.map(
          (b) => html`
            <div class="row" style="padding:10px 0">
              <div class="main"><div class="title">${b.name}</div><div class="sub"><bdi>${b.code}</bdi></div></div>
              ${b.id === building.id
                ? html`<span class="badge in">${t('current')}</span>`
                : html`<button class="btn small" onClick=${() => switchBuilding(b.id)}>${t('open')}</button>`}
            </div>
          `,
        )}
      </div>
      <div class="actions">
        <button class="btn" onClick=${() => setAdding(true)}>${t('add_building')}</button>
        ${building.owner && html`<button class="btn danger" onClick=${removeBuilding}>${t('delete_building')}</button>`}
      </div>
    </div>

    <div class="card pad form section">
      <h2>${t('account')}</h2>
      <p class="muted small"><bdi>${session.email}</bdi></p>
      <div class="actions">
        <${LangButton} />
        <button class="btn" onClick=${() => db.signOut()}>${t('sign_out')}</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------- shell

export function ManagerApp({ building, buildings, session, refresh, showSheet }) {
  const route = useRoute();
  const ov = useLoad(() => db.overview(building.id), [building.id]);
  const [entry, setEntry] = useState(null);
  const [unitEdit, setUnitEdit] = useState(null);

  const parts = route.split('?')[0].split('/').filter(Boolean);
  const section = parts[0] ?? '';
  const link = (href, label, key) => html`<a href=${href} class=${section === key ? 'active' : ''}>${label}</a>`;

  let view;
  if (!ov.data) view = html`<${Loading} state=${ov} />`;
  else {
    const common = { building, ov: ov.data, openEntry: setEntry, onEdit: setUnitEdit };
    if (!section) view = html`<${Home} ...${common} />`;
    else if (section === 'units' && parts[1] === 'edit') view = html`<${BulkEdit} building=${building} ov=${ov.data} />`;
    else if (section === 'units' && parts[1]) view = html`<${UnitDetail} ...${common} id=${parts[1]} key=${parts[1]} />`;
    else if (section === 'units') view = html`<${Units} ...${common} />`;
    else if (section === 'money') view = html`<${Money} ...${common} />`;
    else if (section === 'maintenance') view = html`<${Maintenance} building=${building} />`;
    else if (section === 'report') view = html`<${Report} building=${building} ov=${ov.data} unitId=${parts[1]} key=${parts[1] ?? 'all'} />`;
    else if (section === 'settings') {
      view = html`<${Settings} building=${building} buildings=${buildings} session=${session} refresh=${refresh} showSheet=${showSheet} key=${building.id} />`;
    } else view = html`<p class="state">${t('not_found')} <a href="#/"><u>${t('home')}</u></a></p>`;
  }

  return html`
    <header class="topbar">
      <a class="brand" href="#/"><span class="brand-mark"></span><span class="brand-name">${building.name}</span></a>
      <nav class="nav">
        ${link('#/', t('home'), '')} ${link('#/units', t('apartments'), 'units')} ${link('#/money', t('money'), 'money')}
        ${link('#/maintenance', t('maintenance'), 'maintenance')} ${link('#/settings', t('settings'), 'settings')}
      </nav>
      <div class="user">
        <span class="who"><bdi>${session.email}</bdi></span>
        ${demoMode && html`<button class="btn small" onClick=${() => db.signOut()}>${t('sign_out')}</button>`}
      </div>
    </header>
    <main>${view}</main>
    ${entry && ov.data && html`<${EntryForm} building=${building} units=${ov.data.units} preset=${entry} onClose=${() => setEntry(null)} />`}
    ${unitEdit && html`<${UnitForm} building=${building} unit=${unitEdit} onClose=${() => setUnitEdit(null)} />`}
  `;
}
