// Reports the manager can save as a PDF or print: the whole building, or one apartment's statement.
import { html, useState, useRef } from './lib.js';
import { db } from './data.js';
import { t, lang } from './i18n.js';
import { fmtNum, fmtDate, today, entryTitle, owedText, plain, toast, useLoad, Loading, loadScript } from './ui.js';

// Turns the report on the page into a PDF file. Loaded only when the button is pressed.
const PDF_LIB = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';

const NBSP = String.fromCharCode(0xa0);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// from / to dates of the ready-made periods. An empty "from" means from the very beginning.
function period(key) {
  const d = new Date();
  if (key === 'last') return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (key === 'year') return { from: `${d.getFullYear()}-01-01`, to: today() };
  if (key === 'all') return { from: '', to: today() };
  return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: today() };
}

const sum = (list, pick) => list.reduce((a, x) => a + pick(x), 0);
const byDate = (a, b) => a.entry_date.localeCompare(b.entry_date) || String(a.created_at).localeCompare(String(b.created_at));
// An amount in a table cell; empty instead of 0 keeps the columns easy to read.
const cell = (n) => (Math.abs(n) > 0.004 ? fmtNum(n) : '');

function Fact({ label, value }) {
  return html`<div class="fact"><div class="label">${label}</div><div class="value"><bdi>${value}</bdi></div></div>`;
}

function BuildingReport({ building, ov, entries }) {
  const cur = building.currency;
  const s = ov.summary;
  const fund = entries.filter((e) => ['payment', 'income', 'expense'].includes(e.kind)).sort(byDate);
  const collected = sum(fund, (e) => (e.kind === 'payment' ? e.amount : 0));
  const income = sum(fund, (e) => (e.kind === 'income' ? e.amount : 0));
  const spent = sum(fund, (e) => (e.kind === 'expense' ? e.amount : 0));
  const paidBy = {};
  for (const e of fund) if (e.kind === 'payment') paidBy[e.unit_id] = (paidBy[e.unit_id] ?? 0) + e.amount;

  return html`
    <h3>${t('rp_period_totals')}</h3>
    <div class="facts">
      <${Fact} label=${t('fees_collected')} value=${fmtNum(collected) + ' ' + cur} />
      <${Fact} label=${t('other_income')} value=${fmtNum(income) + ' ' + cur} />
      <${Fact} label=${t('spent')} value=${fmtNum(spent) + ' ' + cur} />
      <${Fact} label=${t('rp_net')} value=${fmtNum(collected + income - spent) + ' ' + cur} />
    </div>

    <h3>${t('rp_now')}</h3>
    <div class="facts">
      <${Fact} label=${t('building_balance')} value=${fmtNum(s.cash) + ' ' + cur} />
      <${Fact} label=${t('unpaid_fees')} value=${fmtNum(s.dues_owed) + ' ' + cur} />
      <${Fact} label=${t('paid_ahead')} value=${fmtNum(s.advance) + ' ' + cur} />
      <${Fact} label=${t('rp_bills_owed')} value=${fmtNum(s.bills_owed) + ' ' + cur} />
    </div>

    <h3>${t('apartments')}</h3>
    <table>
      <thead>
        <tr>
          <th>${t('apartment')}</th><th>${t('resident_name')}</th><th>${t('monthly_fee')}</th>
          <th>${t('rp_paid_period')}</th><th>${t('rp_fee_balance')}</th><th>${t('bills')}</th>
        </tr>
      </thead>
      <tbody>
        ${ov.units.map(
          (u) => html`<tr>
            <td><b><bdi>${u.label}</bdi></b></td>
            <td class="wrap">${u.resident_name ?? ''}</td>
            <td class="num">${fmtNum(u.monthly_fee)}</td>
            <td class="num">${cell(paidBy[u.id] ?? 0)}</td>
            <td class="num">${plain(owedText(u.dues))}</td>
            <td class="num">${cell(u.bills)}</td>
          </tr>`,
        )}
        <tr class="total">
          <td>${t('rp_total')}</td><td></td>
          <td class="num">${fmtNum(sum(ov.units, (u) => u.monthly_fee))}</td>
          <td class="num">${fmtNum(collected)}</td>
          <td class="num">${plain(owedText(s.dues_owed - s.advance))}</td>
          <td class="num">${cell(s.bills_owed)}</td>
        </tr>
      </tbody>
    </table>

    <h3>${t('rp_movements')}</h3>
    <table>
      <thead>
        <tr><th>${t('date')}</th><th>${t('rp_item')}</th><th>${t('note')}</th><th>${t('rp_in')}</th><th>${t('rp_out')}</th></tr>
      </thead>
      <tbody>
        ${fund.length === 0 && html`<tr><td colspan="5">${t('nothing_yet')}</td></tr>`}
        ${fund.map(
          (e) => html`<tr>
            <td>${fmtDate(e.entry_date)}</td>
            <td class="wrap">${entryTitle(e)}${e.unit_label ? html` · <bdi>${e.unit_label}</bdi>` : ''}</td>
            <td class="wrap">${e.note ?? ''}</td>
            <td class="num">${e.kind === 'expense' ? '' : fmtNum(e.amount)}</td>
            <td class="num">${e.kind === 'expense' ? fmtNum(e.amount) : ''}</td>
          </tr>`,
        )}
        <tr class="total">
          <td>${t('rp_total')}</td><td></td><td></td>
          <td class="num">${fmtNum(collected + income)}</td><td class="num">${fmtNum(spent)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function UnitReport({ building, unit, entries, whole }) {
  const cur = building.currency;
  const list = [...entries].sort(byDate);
  const charge = (e) => (['due', 'extra', 'bill'].includes(e.kind) ? e.amount : 0);
  const paid = (e) => (['payment', 'bill_payment'].includes(e.kind) ? e.amount : 0);
  // The balance brought forward belongs to the statement only when it starts from the beginning.
  const opening = whole ? unit.opening_balance : 0;

  return html`
    <div class="facts">
      <${Fact} label=${t('monthly_fee')} value=${fmtNum(unit.monthly_fee) + ' ' + cur} />
      <${Fact} label=${t('fees')} value=${plain(owedText(unit.dues, cur))} />
      <${Fact} label=${t('bills')} value=${plain(owedText(unit.bills, cur))} />
      <${Fact} label=${t('rp_total_now')} value=${plain(owedText(unit.dues + unit.bills, cur))} />
    </div>

    <h3>${t('statement')}</h3>
    <table>
      <thead>
        <tr><th>${t('date')}</th><th>${t('rp_item')}</th><th>${t('note')}</th><th>${t('rp_charged')}</th><th>${t('rp_paid')}</th></tr>
      </thead>
      <tbody>
        ${Math.abs(opening) > 0.004 &&
        html`<tr>
          <td></td><td class="wrap">${t('opening_balance')}</td><td></td>
          <td class="num">${opening > 0 ? fmtNum(opening) : ''}</td><td class="num">${opening < 0 ? fmtNum(-opening) : ''}</td>
        </tr>`}
        ${list.length === 0 && Math.abs(opening) <= 0.004 && html`<tr><td colspan="5">${t('nothing_yet')}</td></tr>`}
        ${list.map(
          (e) => html`<tr>
            <td>${fmtDate(e.entry_date)}</td>
            <td class="wrap">${entryTitle(e)}</td>
            <td class="wrap">${e.note ?? ''}</td>
            <td class="num">${cell(charge(e))}</td>
            <td class="num">${cell(paid(e))}</td>
          </tr>`,
        )}
        <tr class="total">
          <td>${t('rp_total')}</td><td></td><td></td>
          <td class="num">${fmtNum(sum(list, charge) + Math.max(opening, 0))}</td>
          <td class="num">${fmtNum(sum(list, paid) + Math.max(-opening, 0))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

export function Report({ building, ov, unitId }) {
  const unit = unitId ? ov.units.find((u) => u.id === unitId) : null;
  // A statement starts from the beginning; a building report covers this month.
  const [range, setRange] = useState(() => ({ key: unit ? 'all' : 'month', ...period(unit ? 'all' : 'month') }));
  const [busy, setBusy] = useState(false);
  const paper = useRef(null);
  const entries = useLoad(
    () => db.listEntries(building.id, { unitId: unit?.id, from: range.from || undefined, to: range.to || undefined, limit: 5000 }),
    [building.id, unitId, range.from, range.to],
  );
  if (unitId && !unit) return html`<p class="state">${t('not_found')} <a href="#/units"><u>${t('apartments')}</u></a></p>`;

  const chip = (key, label) =>
    html`<button class="chip ${range.key === key ? 'on' : ''}" onClick=${() => setRange({ key, ...period(key) })}>${label}</button>`;
  const title = unit ? t('rp_statement_of', { n: unit.label }) + (unit.resident_name ? ' · ' + unit.resident_name : '') : t('rp_building_report');
  const when = range.from
    ? t('rp_from_to', { from: fmtDate(range.from), to: fmtDate(range.to || today()) })
    : t('rp_until', { to: fmtDate(range.to || today()) });
  const fileName = `${unit ? 'statement-' + unit.label : 'report'}-${building.code}-${range.to || today()}.pdf`;

  async function pdf() {
    setBusy(true);
    try {
      await loadScript(PDF_LIB);
      // The PDF maker drops the spaces between Arabic words. Non-breaking spaces survive, so the
      // file is made from a copy of the report that uses those (long notes keep a few normal
      // spaces, so they can still wrap).
      const copy = paper.current.cloneNode(true);
      if (lang === 'ar') {
        const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const n of nodes) {
          const words = n.nodeValue.split(' ');
          n.nodeValue = words.map((w, i) => (i === 0 ? w : (i % 7 === 0 ? ' ' : NBSP) + w)).join('');
        }
      }
      await window
        .html2pdf()
        .set({
          margin: 10, filename: fileName,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
        })
        .from(copy)
        .save();
    } catch {
      toast(t('pdf_failed'), true);
    }
    setBusy(false);
  }

  return html`
    <a class="back no-print" href=${unit ? '#/units/' + unit.id : '#/money'}>‹ ${unit ? t('apt', { n: unit.label }) : t('money')}</a>
    <div class="page-head no-print">
      <h1>${unit ? t('statement_pdf') : t('report_pdf')}</h1>
      <div class="actions">
        <button class="btn primary" disabled=${busy || !entries.data} onClick=${pdf}>${busy ? t('pdf_making') : t('pdf_download')}</button>
        <button class="btn" disabled=${!entries.data} onClick=${() => print()}>${t('print')}</button>
      </div>
    </div>
    <div class="filters no-print">
      <div class="chips">
        ${chip('month', t('rp_this_month'))} ${chip('last', t('rp_last_month'))} ${chip('year', t('rp_this_year'))} ${chip('all', t('rp_all_time'))}
      </div>
      <input type="date" aria-label=${t('rp_from')} value=${range.from} max=${range.to}
        onInput=${(e) => setRange({ key: '', from: e.target.value, to: range.to })} />
      <input type="date" aria-label=${t('rp_to')} value=${range.to} min=${range.from}
        onInput=${(e) => setRange({ key: '', from: range.from, to: e.target.value })} />
    </div>

    ${entries.data
      ? html`<div class="paper-wrap">
          <div class="paper" ref=${paper}>
            <div class="paper-head">
              <div>
                <h2>${building.name}</h2>
                <div class="paper-title">${title}</div>
              </div>
              <div class="paper-when">
                <div>${when}</div>
                <div>${t('rp_made_on', { d: fmtDate(today()) })}</div>
              </div>
            </div>
            ${unit
              ? html`<${UnitReport} building=${building} unit=${unit} entries=${entries.data} whole=${!range.from} />`
              : html`<${BuildingReport} building=${building} ov=${ov} entries=${entries.data} />`}
          </div>
        </div>`
      : html`<${Loading} state=${entries} />`}
  `;
}
