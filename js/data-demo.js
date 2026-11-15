// Demo data source: everything lives in this browser's localStorage.
// Mirrors the API of data-supabase.js so the rest of the app doesn't care which is in use.
// Demo logins: manager = any email and password. Resident = building DEMO01, any apartment F1-R to F11-L, password 1234.

const KEY = 'building-fund-demo-v2';
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

// Same rule as private.unit_label() in schema.sql: F3 / F3-R, F3-L / F3-1, F3-2 ...
const unitLabel = (floor, k, perFloor) =>
  perFloor <= 1 ? `F${floor}` : perFloor === 2 ? `F${floor}-${k === 1 ? 'R' : 'L'}` : `F${floor}-${k}`;
// A label as people type it: no spaces, hyphens or underscores, lower case.
const loose = (text) => String(text ?? '').replace(/[\s_-]/g, '').toLowerCase();

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
      id, building_id: B1, label: unitLabel(Math.ceil(n / 2), n % 2 ? 1 : 2, 2), floor: Math.ceil(n / 2),
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
    const n = u.sort;
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
    if (e.kind === 'due' || e.kind === 'extra') dues += e.amount;
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

// The content of a backup: the same shape as private.snapshot() in schema.sql.
function snapshot(buildingId) {
  const b = s.buildings.find((x) => x.id === buildingId);
  const copy = (x) => JSON.parse(JSON.stringify(x));
  return {
    app: 'residential-building-app', version: 1, taken_at: new Date().toISOString(),
    building: { name: b.name, code: b.code, currency: b.currency, opening_cash: b.opening_cash },
    units: copy(s.units.filter((u) => u.building_id === buildingId)).map((u) => ({ ...u, password: s.passwords[u.id] ?? null })),
    entries: copy(s.entries.filter((e) => e.building_id === buildingId)),
    maintenance: copy(s.maintenance.filter((m) => m.building_id === buildingId)),
  };
}
// The demo keeps only a few copies, because everything lives in this browser's small storage.
function saveBackup(buildingId, kind) {
  s.backups ??= [];
  const row = { id: uid(), building_id: buildingId, kind, created_at: new Date().toISOString(), data: snapshot(buildingId) };
  s.backups.push(row);
  const same = s.backups.filter((k) => k.building_id === buildingId && k.kind === kind);
  const drop = new Set(same.slice(0, Math.max(0, same.length - 3)).map((k) => k.id));
  s.backups = s.backups.filter((k) => !drop.has(k.id));
  return row;
}

const byDateDesc =(a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at);
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
    const inB = b ? s.units.filter((u) => u.building_id === b.id) : [];
    let unit = inB.find((u) => u.label.toLowerCase() === String(label).trim().toLowerCase());
    if (!unit && loose(label)) {
      const close = inB.filter((u) => loose(u.label) === loose(label));
      if (close.length === 1) unit = close[0];
    }
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
    return s.buildings.map((b) => ({ ...b, owner: true }));
  },
  async relabelUnits(buildingId, coded) {
    requireManager();
    const units = s.units.filter((u) => u.building_id === buildingId && u.floor != null).sort((a, b) => a.floor - b.floor || a.sort - b.sort);
    const perFloor = {};
    units.forEach((u) => (perFloor[u.floor] = (perFloor[u.floor] ?? 0) + 1));
    const seen = {};
    units.forEach((u, i) => {
      seen[u.floor] = (seen[u.floor] ?? 0) + 1;
      u.label = coded ? unitLabel(u.floor, seen[u.floor], perFloor[u.floor]) : String(i + 1);
    });
    save();
  },

  // ---- managers of a building (the demo keeps a simple list of emails)
  async listManagers(buildingId) {
    requireManager();
    const extra = (s.managers ?? {})[buildingId] ?? [];
    return [{ user_id: 'me', email: s.session.email, owner: true }, ...extra.map((email) => ({ user_id: email, email, owner: false }))];
  },
  async addManager(buildingId, email) {
    requireManager();
    const e = String(email).trim().toLowerCase();
    if (!e.includes('@')) throw new Error('no_account');
    s.managers ??= {};
    s.managers[buildingId] ??= [];
    if (!s.managers[buildingId].includes(e) && e !== s.session.email) s.managers[buildingId].push(e);
    save();
  },
  async removeManager(buildingId, userId) {
    requireManager();
    if (s.managers?.[buildingId]) s.managers[buildingId] = s.managers[buildingId].filter((e) => e !== userId);
    save();
  },
  async createBuilding({ name, floors, perFloor, fee, currency, coded }) {
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
        const label = coded !== false ? unitLabel(f, k, perFloor) : String(n);
        s.units.push({
          id, building_id: b.id, label, floor: f, resident_name: '', phone: '', monthly_fee: Number(fee),
          opening_balance: 0, charge_from: monthStart(0), sort: n, created_at: new Date().toISOString(),
        });
        s.passwords[id] = newPassword();
        passwords.push({ label, floor: f, password: s.passwords[id] });
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
    // The daily automatic backup.
    const dayAgo = new Date(Date.now() - 20 * 3600000).toISOString();
    if (!(s.backups ?? []).some((k) => k.building_id === buildingId && k.kind === 'auto' && k.created_at > dayAgo)) {
      saveBackup(buildingId, 'auto');
      save();
    }
    const units = s.units
      .filter((u) => u.building_id === buildingId)
      .sort((a, b) => a.sort - b.sort)
      .map((u) => ({ ...u, ...balances(u), has_password: !!s.passwords[u.id], password: s.passwords[u.id] ?? null }));
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
      monthly_fee: Number(u.monthly_fee || 0),
    };
    let id = u.id;
    if (id) {
      const unit = s.units.find((x) => x.id === id);
      // A changed fee also changes this month's charge; earlier months keep theirs.
      if (unit.monthly_fee !== fields.monthly_fee) {
        const now = monthStart(0);
        if (fields.monthly_fee > 0) {
          s.entries.forEach((e) => e.unit_id === id && e.kind === 'due' && e.month === now && (e.amount = fields.monthly_fee));
        } else s.entries = s.entries.filter((e) => !(e.unit_id === id && e.kind === 'due' && e.month === now));
      }
      Object.assign(unit, fields);
    } else {
      id = uid();
      s.units.push({
        id, building_id: buildingId, ...fields, opening_balance: 0, charge_from: monthStart(0),
        sort: Math.max(0, ...s.units.map((x) => x.sort)) + 1, created_at: new Date().toISOString(),
      });
    }
    save();
    return id;
  },
  async setUnitBalance(unitId, target) {
    requireManager();
    const unit = s.units.find((u) => u.id === unitId);
    chargeDues(unit.building_id);
    unit.opening_balance = Number(unit.opening_balance) + (Number(target) - balances(unit).dues);
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
  async listEntries(buildingId, { unitId, kinds, from, to, limit = 300 } = {}) {
    requireManager();
    return s.entries
      .filter((e) => e.building_id === buildingId && (!unitId || e.unit_id === unitId) && (!kinds || kinds.includes(e.kind)))
      .filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to))
      .sort(byDateDesc)
      .slice(0, limit)
      .map(withLabel);
  },
  async addEntry(buildingId, e) {
    await this.addEntries(buildingId, [e]);
  },
  async addEntries(buildingId, list) {
    requireManager();
    if (list.some((e) => !(Number(e.amount) > 0))) throw new Error('bad_input');
    for (const e of list) {
      s.entries.push({
        id: uid(), building_id: buildingId, unit_id: e.unit_id || null, kind: e.kind, amount: Number(e.amount),
        entry_date: e.entry_date, month: null, category: e.category || null, note: e.note?.trim() || null,
        created_at: new Date().toISOString(),
      });
    }
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

  // ---- backups (manager)
  async backupNow(buildingId) {
    requireManager();
    const row = saveBackup(buildingId, 'manual');
    save();
    return row.data;
  },
  async listBackups(buildingId) {
    requireManager();
    return (s.backups ?? [])
      .filter((k) => k.building_id === buildingId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((k) => ({ id: k.id, kind: k.kind, created_at: k.created_at, units: k.data.units.length, entries: k.data.entries.length }));
  },
  async getBackup(id) {
    requireManager();
    const row = (s.backups ?? []).find((k) => k.id === id);
    if (!row) throw new Error('not_allowed');
    return row.data;
  },
  async restoreBackup(buildingId, { id = null, data = null }) {
    requireManager();
    const v = id ? (s.backups ?? []).find((k) => k.id === id && k.building_id === buildingId)?.data : data;
    if (v?.app !== 'residential-building-app' || !Array.isArray(v.units) || !Array.isArray(v.entries) || !v.building) {
      throw new Error('bad_backup');
    }
    const ids = new Set(v.units.map((u) => u.id));
    if (s.units.some((u) => ids.has(u.id) && u.building_id !== buildingId)) throw new Error('backup_other_building');
    saveBackup(buildingId, 'before_restore');
    const b = s.buildings.find((x) => x.id === buildingId);
    Object.assign(b, { name: v.building.name || b.name, currency: v.building.currency || b.currency, opening_cash: Number(v.building.opening_cash ?? b.opening_cash) });
    const before = new Set(s.units.filter((u) => u.building_id === buildingId).map((u) => u.id));
    before.forEach((u) => !ids.has(u) && delete s.passwords[u]);
    s.units = s.units.filter((u) => u.building_id !== buildingId);
    s.entries = s.entries.filter((e) => e.building_id !== buildingId);
    s.maintenance = s.maintenance.filter((m) => m.building_id !== buildingId);
    for (const u of v.units) {
      const { password, ...unit } = u;
      s.units.push({ ...unit, building_id: buildingId, monthly_fee: Number(unit.monthly_fee), opening_balance: Number(unit.opening_balance) });
      // Apartments that still existed keep their password.
      if (!before.has(u.id) && password) s.passwords[u.id] = password;
    }
    for (const e of v.entries) s.entries.push({ ...e, building_id: buildingId, amount: Number(e.amount) });
    for (const m of v.maintenance ?? []) s.maintenance.push({ ...m, building_id: buildingId, unit_id: ids.has(m.unit_id) ? m.unit_id : null });
    save();
    return { units: v.units.length, entries: v.entries.length, taken_at: v.taken_at };
  },

  // ---- resident
  async residentOverview() {
    const unit = residentUnit();
    const b = s.buildings.find((x) => x.id === unit.building_id);
    chargeDues(b.id);
    const mine = s.entries.filter((e) => e.building_id === b.id);
    return {
      building: { name: b.name, currency: b.currency },
      unit: {
        label: unit.label, floor: unit.floor, resident_name: unit.resident_name, monthly_fee: unit.monthly_fee,
        opening_balance: unit.opening_balance, ...balances(unit),
      },
      statement: mine.filter((e) => e.unit_id === unit.id).sort(byDateDesc),
    };
  },
};
