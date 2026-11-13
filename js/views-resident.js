// Resident screens: my apartment, the building's money, maintenance.
import { html, useState } from './lib.js';
import { db } from './data.js';
import { t, LangButton } from './i18n.js';
import { money, fmtDate, fmtMonth, owedText, useRoute, toast, Modal, changed, useLoad, EntryRow, Tile, Loading } from './ui.js';

function Mine({ d }) {
  const cur = d.building.currency;
  const u = d.unit;
  const total = u.dues + u.bills;
  return html`
    <div class="card pad balance ${total > 0.004 ? 'owes' : total < -0.004 ? 'ahead' : ''}">
      <div class="label">${t('your_balance')}</div>
      <div class="big"><bdi>${owedText(total, cur)}</bdi></div>
      <p class="muted small">${t('fee_per_month', { n: money(u.monthly_fee, cur) })}</p>
    </div>
    <div class="tiles two" style="margin-top:12px">
      <${Tile} label=${t('fees')} value=${owedText(u.dues, cur)} alert=${u.dues > 0.004} good=${u.dues < -0.004} />
      <${Tile} label=${t('bills_paid_for_you')} value=${owedText(u.bills, cur)} alert=${u.bills > 0.004} />
    </div>

    <div class="section">
      <h2>${t('statement')}</h2>
      <div class="card list">
        ${d.statement.length === 0 && !u.opening_balance && html`<p class="empty">${t('nothing_yet')}</p>`}
        ${d.statement.map((e) => html`<${EntryRow} e=${e} cur=${cur} mode="unit" />`)}
        ${u.opening_balance !== 0 &&
        html`<div class="row">
          <div class="main"><div class="title">${t('opening_balance')}</div><div class="sub">${t('opening_balance_sub')}</div></div>
          <div class="delta"><bdi>${money(u.opening_balance, cur)}</bdi></div>
        </div>`}
      </div>
    </div>
  `;
}

function Building({ d }) {
  const cur = d.building.currency;
  const s = d.summary;
  return html`
    <div class="tiles">
      <${Tile} label=${t('building_balance')} value=${money(s.cash, cur)} alert=${s.cash < 0} />
      <${Tile} label=${t('fees_collected')} value=${money(s.collected, cur)} />
      <${Tile} label=${t('spent')} value=${money(s.spent, cur)} />
      <${Tile} label=${t('unpaid_fees_all')} value=${money(s.dues_owed, cur)} />
    </div>

    <div class="section">
      <h2>${t('by_month')}</h2>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr><th>${t('month')}</th><th>${t('collected')}</th><th>${t('other_income')}</th><th>${t('spent')}</th></tr>
          </thead>
          <tbody>
            ${d.months.length === 0 && html`<tr><td colspan="4" class="empty">${t('nothing_yet')}</td></tr>`}
            ${d.months.map(
              (m) => html`<tr>
                <td>${fmtMonth(m.month)}</td>
                <td class="num">${money(m.collected)}</td>
                <td class="num">${money(m.income)}</td>
                <td class="num">${money(m.spent)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2>${t('spending_and_income')}</h2>
      <div class="card list">
        ${d.ledger.length === 0 && html`<p class="empty">${t('nothing_yet')}</p>`}
        ${d.ledger.map((e) => html`<${EntryRow} e=${e} cur=${cur} />`)}
      </div>
    </div>
  `;
}

function Maintenance({ d }) {
  const [report, setReport] = useState(null);
  async function submit() {
    await db.residentReport(report.title, report.details);
    changed();
    toast(t('report_sent'));
    setReport(null);
  }
  return html`
    <div class="page-head">
      <h1>${t('maintenance')}</h1>
      <button class="btn primary" onClick=${() => setReport({ title: '', details: '' })}>${t('report_problem')}</button>
    </div>
    <div class="card list">
      ${d.maintenance.length === 0 && html`<p class="empty">${t('no_maintenance')}</p>`}
      ${d.maintenance.map(
        (m) => html`
          <div class="row">
            <div class="main">
              <div class="title">${m.title}</div>
              <div class="sub">${[fmtDate(m.created_at), m.mine ? t('reported_by_you') : '', m.details].filter(Boolean).join(' · ')}</div>
            </div>
            <span class="badge st-${m.status}">${t('st.' + m.status)}</span>
          </div>
        `,
      )}
    </div>
    ${report &&
    html`<${Modal} title=${t('report_problem')} submitLabel=${t('send')} onClose=${() => setReport(null)} onSubmit=${submit}>
      <label><span>${t('what_is_wrong')}</span><input required maxlength="120" value=${report.title} onInput=${(e) => setReport({ ...report, title: e.target.value })} /></label>
      <label><span>${t('details')}</span><textarea maxlength="1000" value=${report.details} onInput=${(e) => setReport({ ...report, details: e.target.value })}></textarea></label>
    <//>`}
  `;
}

export function ResidentApp() {
  const route = useRoute();
  const data = useLoad(() => db.residentOverview(), []);
  const section = route.split('?')[0].split('/').filter(Boolean)[0] ?? '';
  const link = (href, label, key) => html`<a href=${href} class=${section === key ? 'active' : ''}>${label}</a>`;
  const d = data.data;

  let view;
  if (!d) view = html`<${Loading} state=${data} />`;
  else if (section === 'building') view = html`<${Building} d=${d} />`;
  else if (section === 'maintenance') view = html`<${Maintenance} d=${d} />`;
  else view = html`<${Mine} d=${d} />`;

  return html`
    <header class="topbar">
      <a class="brand" href="#/">
        <span class="brand-mark"></span>
        <span class="brand-name">${d ? `${t('apt', { n: d.unit.label })} · ${d.building.name}` : ''}</span>
      </a>
      <nav class="nav">
        ${link('#/', t('my_apartment'), '')} ${link('#/building', t('building_money'), 'building')}
        ${link('#/maintenance', t('maintenance'), 'maintenance')}
      </nav>
      <div class="user">
        <${LangButton} />
        <button class="btn small" onClick=${() => db.signOut()}>${t('sign_out')}</button>
      </div>
    </header>
    <main>${view}</main>
  `;
}
