// Resident screen: one page with their own apartment, balance and statement.
// Nothing about the building's money or other apartments.
import { html } from './lib.js';
import { db } from './data.js';
import { t, LangButton } from './i18n.js';
import { money, owedText, useLoad, EntryRow, Tile, Loading } from './ui.js';

function Mine({ d }) {
  const cur = d.building.currency;
  const u = d.unit;
  const total = u.dues + u.bills;
  return html`
    <div class="page-head">
      <div>
        <h1>${t('apt', { n: u.label })}${u.resident_name ? ' · ' + u.resident_name : ''}</h1>
        <p class="muted small">
          ${[d.building.name, u.floor != null ? t('floor_n', { n: u.floor }) : '', t('fee_per_month', { n: money(u.monthly_fee, cur) })]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>

    <div class="card pad balance ${total > 0.004 ? 'owes' : total < -0.004 ? 'ahead' : ''}">
      <div class="label">${t('your_balance')}</div>
      <div class="big"><bdi>${owedText(total, cur)}</bdi></div>
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

export function ResidentApp() {
  const data = useLoad(() => db.residentOverview(), []);
  const d = data.data;
  return html`
    <header class="topbar">
      <a class="brand" href="#/">
        <span class="brand-mark"></span>
        <span class="brand-name">${d ? d.building.name : ''}</span>
      </a>
      <div class="user" style="margin-inline-start:auto">
        <${LangButton} />
        <button class="btn small" onClick=${() => db.signOut()}>${t('sign_out')}</button>
      </div>
    </header>
    <main>${d ? html`<${Mine} d=${d} />` : html`<${Loading} state=${data} />`}</main>
  `;
}
