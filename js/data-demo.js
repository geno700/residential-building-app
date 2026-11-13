// Demo data source: everything lives in this browser's localStorage.
// Mirrors the API of data-supabase.js so the rest of the app doesn't care which is in use.
// Demo logins: manager = any email and password. Resident = building DEMO01, any apartment 1-22, password 1234.

const KEY = 'building-fund-demo-v1';
const B1 = 'demo-building';
const DEMO_PASSWORD = '1234';

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// First day of the month that is `offset` months from now.
const monthStart = (offset = 0) => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() + offset, 1));
};
const dayIn = (offset, day) => {
  const d = new Date();
  const date = new Date(d.getFullYear(), d.getMonth() + offset, day);
  return ymd(date > d ? d : date);
};
const nextMonth = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return ymd(new Date(y, m, 1));
};
const newPassword = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');

function seed() {
  const s = {
    session: null,
    buildings: [
      { id: B1, name: 'Nile Tower (demo)', code: 'DEMO01', currency: 'EGP', opening_cash: 1500, created_at: new Date().toISOString() },
    ],
    units: [],
    passwords: {},
    entries: [],
    maintenance: [],
  };
  const names = ['Ahmed', 'Mona', 'Hany', 'Sara', 'Omar', 'Nadia', 'Karim', 'Laila', 'Tarek', 'Dina', 'Youssef'];
  for (let n = 1; n <= 22; n++) {
    const id = 'u' + n;
    s.units.push({
      id, building_id: B1, label: String(n), floor: Math.ceil(n / 2),
      resident_name: n % 2 ? names[(n - 1) / 2] : '', phone: '',
      monthly_fee: n % 7 === 0 ? 50 : n % 4 === 0 ? 100 : 120,
      opening_balance: n === 9 ? 240 : 0, charge_from: monthStart(-4), sort: n,
      created_at: new Date().toISOString(),
    });
    s.passwords[id] = DEMO_PASSWORD;
  }
  const add = (e) => s.entries.push({ id: uid(), building_id: B1, unit_id: null, category: null, note: null, month: null, created_at: new Date().toISOString(), ...e });

  // Payments: most apartments are up to date, a few are behind, a few paid ahead.
  for (const u of s.units) {
    const n = Number(u.label);
    const months = n % 5 === 0 ? 3 : n % 5 === 1 ? 7 : n % 3 === 0 ? 4 : 5;
    for (let i = 0; i < months; i++) {
      const offset = Math.min(-4 + i, 0);
      add({ unit_id: u.id, kind: 'payment', amount: u.monthly_fee, entry_date: dayIn(offset, 3 + (n % 9)) });
    }
  }
  add({ unit_id: 'u3', kind: 'bill', category: 'water', amount: 85, entry_date: dayIn(-1, 12) });
  add({ unit_id: 'u8', kind: 'bill', category: 'gas', amount: 140, entry_date: dayIn(-1, 18) });
  add({ unit_id: 'u8', kind: 'bill_payment', amount: 100, entry_date: dayIn(0, 2) });
  add({ unit_id: 'u15', kind: 'bill', category: 'electricity', amount: 210, entry_date: dayIn(0, 4) });

  for (let offset = -4; offset <= 0; offset++) {
    add({ kind: 'expense', category: 'cleaning', amount: 600, entry_date: dayIn(offset, 5), note: 'Stairs and entrance' });
    add({ kind: 'expense', category: 'electricity', amount: 180, entry_date: dayIn(offset, 9), note: 'Stairs lighting and elevator' });
  }
  add({ kind: 'expense', category: 'elevator', amount: 900, entry_date: dayIn(-3, 14), note: 'Yearly service contract' });
  add({ kind: 'expense', category: 'maintenance', amount: 1200, entry_date: dayIn(-1, 20), note: 'Water pump repair' });
  add({ kind: 'income', amount: 500, entry_date: dayIn(-2, 1), note: 'Rooftop antenna rent' });

  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
  s.maintenance.push(
    { id: uid(), building_id: B1, title: 'Water pump repair', details: 'Motor replaced', status: 'done', unit_id: null, created_at: ago(40), done_at: ago(35) },
    { id: uid(), building_id: B1, title: 'Elevator door sticks on floor 6', details: 'Technician booked', status: 'progress', unit_id: null, created_at: ago(6), done_at: null },
    { id: uid(), building_id: B1, title: 'Stairs light out on floor 3', details: '', status: 'open', unit_id: 'u5', created_at: ago(2), done_at: null },
  );
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Unreadable or blocked storage: start again from the sample data.
  }
  return seed();
}
let s = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: changes last until the page is closed.
  }
}

const listeners = new Set();
const notify = () => listeners.forEach((cb) => setTimeout(cb, 0));

// ---- the same rules as supabase/schema.sql

function chargeDues(buildingId) {
  const last = monthStart(0);
  for (const u of s.units.filter((x) => x.building_id === buildingId && x.monthly_fee > 0)) {
    for (let m = u.charge_from; m <= last; m = nextMonth(m)) {
      if (!s.entries.some((e) => e.kind === 'due' && e.unit_id === u.id && e.month === m)) {
        s.entries.push({
          id: uid(), building_id: buildingId, unit_id: u.id, kind: 'due', amount: u.monthly_fee,
          entry_date: m, month: m, category: null, note: null, created_at: new Date().toISOString(),
        });
      }
    }
  }
  save();
}

function balances(unit) {
  let dues = Number(unit.opening_balance);
  let bills = 0;
  for (const e of s.entries) {
    if (e.unit_id !== unit.id) continue;
    if (e.kind === 'due') dues += e.amount;
    else if (e.kind === 'payment') dues -= e.amount;
    else if (e.kind === 'bill') bills += e.amount;
    else if (e.kind === 'bill_payment') bills -= e.amount;
  }
  return { dues, bills };
}

function summary(buildingId) {
  const b = s.buildings.find((x) => x.id === buildingId);
  const sum = (kind) =>
    s.entries.filter((e) => e.building_id === buildingId && e.kind === kind).reduce((a, e) => a + e.amount, 0);
  const collected = sum('payment');
  const income = sum('income');
  const spent = sum('expense');
  let dues_owed = 0;
  let advance = 0;
  let bills_owed = 0;
  for (const u of s.units.filter((x) => x.building_id === buildingId)) {
    const bal = balances(u);
    dues_owed += Math.max(bal.dues, 0);
    advance += Math.max(-bal.dues, 0);
    bills_owed += bal.bills;
  }
  return {
    cash: Number(b.opening_cash) + collected + income - spent,
    opening_cash: Number(b.opening_cash), collected, income, spent, dues_owed, advance, bills_owed,
  };
}

const byDateDesc = (a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at);
const withLabel = (e) => ({ ...e, unit_label: s.units.find((u) => u.id === e.unit_id)?.label ?? '' });

function requireManager() {
  if (s.session?.role !== 'manager') throw new Error('not_allowed');
}
function residentUnit() {
  const unit = s.session?.role === 'resident' && s.units.find((u) => u.id === s.session.unit_id);
  if (!unit) {
    s.session = null;
    save();
    notify();
    throw new Error('session_expired');
  }
  return unit;
}

export default {
  // ---- who is signed in
  async session() {
    if (!s.session) return null;
    return s.session.role === 'manager' ? { role: 'manager', email: s.session.email } : { role: 'resident' };
  },
  onAuthChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  async signIn(email) {
    s.session = { role: 'manager', email };
    save();
    notify();
  },
  async signUp(email) {
    await this.signIn(email);
    return { needsConfirm: false };
  },
  async signOut() {
    s.session = null;
    save();
    notify();
  },
  async sendPasswordReset() {},
  inRecovery: () => false,
  async setPassword() {},

  async residentLogin(code, label, password) {
    const b = s.buildings.find((x) => x.code === String(code).trim().toUpperCase());
    const unit = b && s.units.find((u) => u.building_id === b.id && u.label.toLowerCase() === String(label).trim().toLowerCase());
    if (!unit || s.passwords[unit.id] !== password) throw new Error('wrong_login');
    s.session = { role: 'resident', unit_id: unit.id };
    save();
    notify();
  },

  resetDemo() {
    s = seed();
    save();
  },

  // ---- buildings (manager)
  async listBuildings() {
    requireManager();
    return s.buildings.map((b) => ({ ...b }));
  },
  async createBuilding({ name, floors, perFloor, fee, currency }) {
    requireManager();
    if (!String(name).trim() || floors < 1 || perFloor < 1 || floors * perFloor > 300 || fee < 0) throw new Error('bad_input');
    if (s.buildings.length >= 5) throw new Error('too_many_buildings');
    const b = {
      id: uid(), name: String(name).trim(), code: 'DEMO' + pad(s.buildings.length + 1),
      currency: currency || 'EGP', opening_cash: 0, created_at: new Date().toISOString(),
    };
    s.buildings.push(b);
    const passwords = [];
    let n = 0;
    for (let f = 1; f <= floors; f++) {
      for (let k = 1; k <= perFloor; k++) {
        n++;
        const id = uid();
        s.units.push({
          id, building_id: b.id, label: String(n), floor: f, resident_name: '', phone: '', monthly_fee: Number(fee),
          opening_balance: 0, charge_from: monthStart(0), sort: n, created_at: new Date().toISOString(),
        });
        s.passwords[id] = newPassword();
        passwords.push({ label: String(n), floor: f, password: s.passwords[id] });
      }
    }
    save();
    return { building: { ...b }, passwords };
  },
  async updateBuilding(id, { name, currency, opening_cash }) {
    requireManager();
    Object.assign(s.buildings.find((b) => b.id === id), {
      name: name.trim(), currency: currency.trim(), opening_cash: Number(opening_cash),
    });
    save();
  },
  async deleteBuilding(id) {
    requireManager();
    const units = s.units.filter((u) => u.building_id === id).map((u) => u.id);
    units.forEach((u) => delete s.passwords[u]);
    s.buildings = s.buildings.filter((b) => b.id !== id);
    s.units = s.units.filter((u) => u.building_id !== id);
    s.entries = s.entries.filter((e) => e.building_id !== id);
    s.maintenance = s.maintenance.filter((m) => m.building_id !== id);
    save();
  },
  async overview(buildingId) {
    requireManager();
    chargeDues(buildingId);
    const units = s.units
      .filter((u) => u.building_id === buildingId)
      .sort((a, b) => a.sort - b.sort)
      .map((u) => ({ ...u, ...balances(u), has_password: !!s.passwords[u.id] }));
    return { summary: summary(buildingId), units };
  },

  // ---- apartments (manager)
  async saveUnit(buildingId, u) {
    requireManager();
    const label = String(u.label).trim();
    if (s.units.some((x) => x.building_id === buildingId && x.id !== u.id && x.label.toLowerCase() === label.toLowerCase())) {
      throw new Error('label_taken');
    }
    const fields = {
      label, floor: u.floor === '' || u.floor == null ? null : Number(u.floor),
      resident_name: u.resident_name?.trim() ?? '', phone: u.phone?.trim() ?? '',
      monthly_fee: Number(u.monthly_fee || 0), opening_balance: Number(u.opening_balance || 0),
    };
    if (u.id) Object.assign(s.units.find((x) => x.id === u.id), fields);
    else {
      s.units.push({
        id: uid(), building_id: buildingId, ...fields, charge_from: monthStart(0),
        sort: Math.max(0, ...s.units.map((x) => x.sort)) + 1, created_at: new Date().toISOString(),
      });
    }
    save();
  },
  async deleteUnit(id) {
    requireManager();
    s.units = s.units.filter((u) => u.id !== id);
    s.entries = s.entries.filter((e) => e.unit_id !== id);
    s.maintenance.forEach((m) => m.unit_id === id && (m.unit_id = null));
    delete s.passwords[id];
    save();
  },
  async setUnitPassword(unitId, password) {
    requireManager();
    const pw = String(password ?? '').trim() || newPassword();
    if (pw.length < 4) throw new Error('short_password');
    s.passwords[unitId] = pw;
    save();
    return pw;
  },
  async resetAllPasswords(buildingId) {
    requireManager();
    const list = s.units
      .filter((u) => u.building_id === buildingId)
      .sort((a, b) => a.sort - b.sort)
      .map((u) => {
        s.passwords[u.id] = newPassword();
        return { label: u.label, floor: u.floor, password: s.passwords[u.id] };
      });
    save();
    return list;
  },

  // ---- ledger (manager)
  async listEntries(buildingId, { unitId, kinds, limit = 300 } = {}) {
    requireManager();
    return s.entries
      .filter((e) => e.building_id === buildingId && (!unitId || e.unit_id === unitId) && (!kinds || kinds.includes(e.kind)))
      .sort(byDateDesc)
      .slice(0, limit)
      .map(withLabel);
  },
  async addEntry(buildingId, e) {
    requireManager();
    if (!(Number(e.amount) > 0)) throw new Error('bad_input');
    s.entries.push({
      id: uid(), building_id: buildingId, unit_id: e.unit_id || null, kind: e.kind, amount: Number(e.amount),
      entry_date: e.entry_date, month: null, category: e.category || null, note: e.note?.trim() || null,
      created_at: new Date().toISOString(),
    });
    save();
  },
  async deleteEntry(id) {
    requireManager();
    s.entries = s.entries.filter((e) => e.id !== id);
    save();
  },

  // ---- maintenance (manager)
  async listMaintenance(buildingId) {
    requireManager();
    return s.maintenance
      .filter((m) => m.building_id === buildingId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(withLabel);
  },
  async saveMaintenance(buildingId, m) {
    requireManager();
    const fields = {
      title: m.title.trim(), details: m.details?.trim() ?? '', status: m.status,
      done_at: m.status === 'done' ? m.done_at ?? new Date().toISOString() : null,
    };
    if (m.id) Object.assign(s.maintenance.find((x) => x.id === m.id), fields);
    else s.maintenance.push({ id: uid(), building_id: buildingId, unit_id: null, created_at: new Date().toISOString(), ...fields });
    save();
  },
  async deleteMaintenance(id) {
    requireManager();
    s.maintenance = s.maintenance.filter((m) => m.id !== id);
    save();
  },

  // ---- resident
  async residentOverview() {
    const unit = residentUnit();
    const b = s.buildings.find((x) => x.id === unit.building_id);
    chargeDues(b.id);
    const mine = s.entries.filter((e) => e.building_id === b.id);
    const months = {};
    for (const e of mine) {
      if (!['payment', 'income', 'expense'].includes(e.kind)) continue;
      const m = e.entry_date.slice(0, 7) + '-01';
      months[m] ??= { month: m, collected: 0, income: 0, spent: 0 };
      months[m][e.kind === 'payment' ? 'collected' : e.kind === 'income' ? 'income' : 'spent'] += e.amount;
    }
    return {
      building: { name: b.name, currency: b.currency },
      unit: {
        label: unit.label, floor: unit.floor, resident_name: unit.resident_name, monthly_fee: unit.monthly_fee,
        opening_balance: unit.opening_balance, ...balances(unit),
      },
      statement: mine.filter((e) => e.unit_id === unit.id).sort(byDateDesc),
      summary: summary(b.id),
      ledger: mine.filter((e) => e.kind === 'expense' || e.kind === 'income').sort(byDateDesc),
      months: Object.values(months).sort((a, c) => c.month.localeCompare(a.month)).slice(0, 12),
      maintenance: s.maintenance
        .filter((m) => m.building_id === b.id)
        .sort((a, c) => c.created_at.localeCompare(a.created_at))
        .map((m) => ({ id: m.id, title: m.title, details: m.details, status: m.status, created_at: m.created_at, done_at: m.done_at, mine: m.unit_id === unit.id })),
    };
  },
  async residentReport(title, details) {
    const unit = residentUnit();
    if (!String(title).trim()) throw new Error('bad_input');
    if (s.maintenance.filter((m) => m.unit_id === unit.id && m.status !== 'done').length >= 5) throw new Error('too_many_reports');
    s.maintenance.push({
      id: uid(), building_id: unit.building_id, title: String(title).trim().slice(0, 120), details: String(details ?? '').trim(),
      status: 'open', unit_id: unit.id, created_at: new Date().toISOString(), done_at: null,
    });
    save();
  },
};
