// App shell: sign-in for residents and managers, then the right set of screens.
import { html, render, useState, useEffect } from './lib.js';
import { db, demoMode } from './data.js';
import { config } from '../config.js';
import { t, LangButton } from './i18n.js';
import { latinDigits, errText, remember, recall, toast } from './ui.js';
import { ManagerApp, CreateBuilding, AccessSheet, lastBuilding } from './views-manager.js';
import { ResidentApp } from './views-resident.js';

// The link residents get looks like .../?b=CODE. Remember the code so they only type it once.
const CODE_KEY = 'building-fund-code';
{
  const url = new URL(location.href);
  const code = url.searchParams.get('b');
  if (code) {
    remember(CODE_KEY, code.trim().toUpperCase());
    url.searchParams.delete('b');
    history.replaceState(null, '', url);
  }
}

function Brand() {
  return html`<div class="brand"><span class="brand-mark"></span><span class="brand-name">${config.appName}</span></div>`;
}

function ResidentLogin() {
  const [f, setF] = useState({ code: recall(CODE_KEY) ?? (demoMode ? 'DEMO01' : ''), unit: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const code = f.code.trim().toUpperCase();
      await db.residentLogin(code, latinDigits(f.unit).trim(), latinDigits(f.password));
      remember(CODE_KEY, code);
      location.hash = '#/';
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return html`
    <form class="card pad form" onSubmit=${submit}>
      ${error && html`<p class="error">${error}</p>`}
      ${demoMode && html`<p class="small muted">${t('demo_resident_hint')}</p>`}
      <label><span>${t('building_code')}</span><input required dir="ltr" autocapitalize="characters" autocomplete="off" value=${f.code} onInput=${set('code')} /></label>
      <label><span>${t('apartment_number')}</span><input required dir="ltr" inputmode="numeric" autocomplete="username" value=${f.unit} onInput=${set('unit')} /></label>
      <label><span>${t('password')}</span><input type="password" required dir="ltr" autocomplete="current-password" value=${f.password} onInput=${set('password')} /></label>
      <button class="btn primary" disabled=${busy}>${t('sign_in')}</button>
      <p class="small muted">${t('resident_login_hint')}</p>
    </form>
  `;
}

function ManagerLogin() {
  const [mode, setMode] = useState('in'); // in | up | reset
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const to = (m) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await db.signIn(f.email.trim(), f.password);
      else if (mode === 'reset') {
        await db.sendPasswordReset(f.email.trim());
        setNotice(t('reset_sent'));
      } else {
        const res = await db.signUp(f.email.trim(), f.password);
        if (res.needsConfirm) setNotice(t('confirm_email'));
      }
    } catch (err) {
      setError(errText(err));
    }
    setBusy(false);
  }

  const title = { in: t('sign_in'), up: t('create_account'), reset: t('reset_password') }[mode];
  return html`
    <form class="card pad form" onSubmit=${submit}>
      ${mode !== 'in' && html`<h2>${title}</h2>`}
      ${mode === 'up' && html`<p class="small muted">${t('manager_signup_hint')}</p>`}
      ${demoMode && html`<p class="small muted">${t('demo_manager_hint')}</p>`}
      ${notice && html`<p class="small">${notice}</p>`}
      ${error && html`<p class="error">${error}</p>`}
      <label><span>${t('email')}</span><input type="email" required dir="ltr" value=${f.email} onInput=${set('email')} autocomplete="email" /></label>
      ${mode !== 'reset' &&
      html`<label>
        <span>${t('password')}</span>
        <input type="password" required minlength="6" dir="ltr" value=${f.password} onInput=${set('password')}
          autocomplete=${mode === 'in' ? 'current-password' : 'new-password'} />
      </label>`}
      <button class="btn primary" disabled=${busy}>${mode === 'reset' ? t('send_reset') : title}</button>
    </form>
    <p class="switch">
      <button type="button" onClick=${() => to(mode === 'in' ? 'up' : 'in')}>
        ${mode === 'in' ? t('new_manager') : t('back_to_sign_in')}
      </button>
    </p>
    ${mode === 'in' && html`<p class="switch"><button type="button" onClick=${() => to('reset')}>${t('forgot_password')}</button></p>`}
  `;
}

function Login() {
  const [tab, setTab] = useState('resident');
  return html`
    <div class="auth">
      <${Brand} />
      <div class="tabs">
        <button class=${tab === 'resident' ? 'on' : ''} onClick=${() => setTab('resident')}>${t('resident')}</button>
        <button class=${tab === 'manager' ? 'on' : ''} onClick=${() => setTab('manager')}>${t('manager')}</button>
      </div>
      ${tab === 'resident' ? html`<${ResidentLogin} />` : html`<${ManagerLogin} />`}
      <p class="switch"><${LangButton} /></p>
    </div>
  `;
}

function SetPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await db.setPassword(password);
      toast(t('password_changed'));
      onDone();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }
  return html`
    <div class="auth">
      <${Brand} />
      <form class="card pad form" onSubmit=${submit}>
        <h2>${t('choose_new_password')}</h2>
        ${error && html`<p class="error">${error}</p>`}
        <label>
          <span>${t('new_password')}</span>
          <input type="password" required minlength="6" dir="ltr" value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete="new-password" />
        </label>
        <button class="btn primary" disabled=${busy}>${t('save')}</button>
      </form>
    </div>
  `;
}

function App() {
  const [auth, setAuth] = useState({ loading: true });
  const [sheet, setSheet] = useState(null);

  async function refresh() {
    try {
      const session = await db.session();
      if (!session) return setAuth({ session: null });
      if (session.role === 'resident') return setAuth({ session });
      setAuth({ session, buildings: await db.listBuildings() });
    } catch (err) {
      setAuth({ error: errText(err) });
    }
  }
  useEffect(() => {
    refresh();
    return db.onAuthChange(refresh);
  }, []);

  const banner =
    demoMode &&
    html`<div class="banner no-print">
      <span>${t('demo_banner')}</span>
      <button onClick=${() => { db.resetDemo(); location.hash = ''; location.reload(); }}>${t('demo_reset')}</button>
    </div>`;

  let view;
  if (auth.loading) view = html`<p class="boot">${t('loading')}</p>`;
  else if (auth.error) view = html`<p class="state">${t('cannot_connect')} ${auth.error}</p>`;
  else if (!auth.session) view = html`<${Login} />`;
  else if (auth.session.role === 'resident') view = html`<${ResidentApp} />`;
  else if (db.inRecovery()) view = html`<${SetPassword} onDone=${refresh} />`;
  else if (sheet) view = html`<${AccessSheet} sheet=${sheet} onClose=${() => setSheet(null)} />`;
  else if (!auth.buildings.length) {
    view = html`
      <div class="auth wide">
        <${Brand} />
        <${CreateBuilding} onDone=${(res) => { setSheet(res); refresh(); }} />
        <p class="switch"><button type="button" onClick=${() => db.signOut()}>${t('sign_out')} (${auth.session.email})</button></p>
      </div>
    `;
  } else {
    const last = lastBuilding();
    const building = auth.buildings.find((b) => b.id === last) ?? auth.buildings[0];
    view = html`<${ManagerApp} building=${building} buildings=${auth.buildings} session=${auth.session} refresh=${refresh}
      showSheet=${setSheet} key=${building.id} />`;
  }

  return html`${banner}${view}`;
}

render(html`<${App} />`, document.getElementById('app'));
