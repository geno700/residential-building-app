// Live data source: Supabase (Postgres + logins). Same API as data-demo.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { config } from '../config.js';

// A password-reset link brings the manager back with this marker in the address.
let recovery = location.hash.includes('type=recovery');

const sb = createClient(config.supabaseUrl, config.supabaseAnonKey);

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// Residents have no Supabase login. Their session is a token kept in this browser.
const TOKEN_KEY = 'building-fund-resident';
const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the resident signs in again next time.
  }
};

const listeners = new Set();
const notify = () => listeners.forEach((cb) => setTimeout(cb, 0));

const num = (v) => Number(v ?? 0);
const flatEntry = (e) => ({ ...e, amount: num(e.amount), unit_label: e.unit?.label ?? '' });
const flatUnit = (u) => ({
  ...u,
  monthly_fee: num(u.monthly_fee),
  opening_balance: num(u.opening_balance),
  dues: num(u.dues),
  bills: num(u.bills),
});
const flatSummary = (s) => Object.fromEntries(Object.entries(s ?? {}).map(([k, v]) => [k, num(v)]));

export default {
  // ---- who is signed in
  async session() {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) return { role: 'manager', email: data.session.user.email };
    if (getToken()) return { role: 'resident' };
    return null;
  },
  onAuthChange(cb) {
    listeners.add(cb);
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      setTimeout(cb, 0);
    });
    return () => {
      listeners.delete(cb);
      data.subscription.unsubscribe();
    };
  },
  async signIn(email, password) {
    ok(await sb.auth.signInWithPassword({ email, password }));
    setToken(null);
  },
  async signUp(email, password) {
    const data = ok(
      await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }),
    );
    return { needsConfirm: !data.session };
  },
  async signOut() {
    const token = getToken();
    if (token) {
      setToken(null);
      await sb.rpc('resident_logout', { p_token: token });
    }
    await sb.auth.signOut();
    notify();
  },
  async sendPasswordReset(email) {
    ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
  },
  inRecovery: () => recovery,
  async setPassword(password) {
    ok(await sb.auth.updateUser({ password }));
    recovery = false;
  },

  async residentLogin(code, unit, password) {
    const res = ok(await sb.rpc('resident_login', { p_code: code, p_unit: unit, p_password: password }));
    if (!res?.ok) throw new Error(res?.error ?? 'wrong_login');
    setToken(res.token);
    notify();
  },

  // ---- buildings (manager)
  async listBuildings() {
    const { data } = await sb.auth.getSession();
    const me = data.session?.user?.id;
    return ok(await sb.from('buildings').select('*').order('created_at')).map((b) => ({
      ...b,
      opening_cash: num(b.opening_cash),
      owner: b.manager_id === me,
    }));
  },
  async createBuilding({ name, floors, perFloor, fee, currency, coded }) {
    return ok(
      await sb.rpc('create_building', {
        p_name: name, p_floors: Number(floors), p_per_floor: Number(perFloor), p_fee: Number(fee), p_currency: currency,
        p_coded: coded !== false,
      }),
    );
  },
  async relabelUnits(buildingId, coded) {
    ok(await sb.rpc('relabel_units', { p_building: buildingId, p_coded: coded }));
  },

  // ---- managers of a building
  async listManagers(buildingId) {
    return ok(await sb.rpc('list_managers', { p_building: buildingId }));
  },
  async addManager(buildingId, email) {
    ok(await sb.rpc('add_manager', { p_building: buildingId, p_email: email }));
  },
  async removeManager(buildingId, userId) {
    ok(await sb.rpc('remove_manager', { p_building: buildingId, p_user: userId }));
  },
  async updateBuilding(id, { name, currency, opening_cash }) {
    ok(await sb.from('buildings').update({ name: name.trim(), currency: currency.trim(), opening_cash: Number(opening_cash) }).eq('id', id));
  },
  async deleteBuilding(id) {
    const gone = ok(await sb.from('buildings').delete().eq('id', id).select('id'));
    if (!gone.length) throw new Error('not_allowed');
  },
  async overview(buildingId) {
    const res = ok(await sb.rpc('manager_overview', { p_building: buildingId }));
    return { summary: flatSummary(res.summary), units: res.units.map(flatUnit) };
  },

  // ---- apartments (manager)
  async saveUnit(buildingId, u) {
    const fields = {
      label: String(u.label).trim(),
      floor: u.floor === '' || u.floor == null ? null : Number(u.floor),
      resident_name: u.resident_name?.trim() || null,
      phone: u.phone?.trim() || null,
      monthly_fee: Number(u.monthly_fee || 0),
    };
    const q = u.id
      ? sb.from('units').update(fields).eq('id', u.id)
      : sb.from('units').insert({ ...fields, building_id: buildingId, sort: Date.now() % 2000000000 });
    const { data, error } = await q.select('id').single();
    if (error) throw new Error(error.code === '23505' ? 'label_taken' : error.message);
    return data.id;
  },
  async deleteUnit(id) {
    ok(await sb.from('units').delete().eq('id', id));
  },
  // Make the apartment's fee balance exactly this amount now (positive: owes, negative: credit).
  async setUnitBalance(unitId, target) {
    ok(await sb.rpc('set_unit_balance', { p_unit: unitId, p_target: Number(target) }));
  },
  async setUnitPassword(unitId, password) {
    return ok(await sb.rpc('set_unit_password', { p_unit: unitId, p_password: password || null }));
  },
  async resetAllPasswords(buildingId) {
    return ok(await sb.rpc('reset_all_passwords', { p_building: buildingId }));
  },

  // ---- ledger (manager)
  async listEntries(buildingId, { unitId, kinds, limit = 300 } = {}) {
    let q = sb.from('entries').select('*, unit:units(label)').eq('building_id', buildingId)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
    if (unitId) q = q.eq('unit_id', unitId);
    if (kinds) q = q.in('kind', kinds);
    return ok(await q).map(flatEntry);
  },
  async addEntry(buildingId, e) {
    await this.addEntries(buildingId, [e]);
  },
  // Several entries in one go, e.g. the same extra fee for every apartment.
  async addEntries(buildingId, list) {
    ok(
      await sb.from('entries').insert(
        list.map((e) => ({
          building_id: buildingId, unit_id: e.unit_id || null, kind: e.kind, amount: Number(e.amount),
          entry_date: e.entry_date, category: e.category || null, note: e.note?.trim() || null,
        })),
      ),
    );
  },
  async deleteEntry(id) {
    ok(await sb.from('entries').delete().eq('id', id));
  },

  // ---- maintenance (manager)
  async listMaintenance(buildingId) {
    const rows = ok(
      await sb.from('maintenance').select('*, unit:units(label)').eq('building_id', buildingId)
        .order('created_at', { ascending: false }).limit(300),
    );
    return rows.map((m) => ({ ...m, unit_label: m.unit?.label ?? '' }));
  },
  async saveMaintenance(buildingId, m) {
    const fields = {
      title: m.title.trim(), details: m.details?.trim() || null, status: m.status,
      done_at: m.status === 'done' ? m.done_at ?? new Date().toISOString() : null,
    };
    const q = m.id
      ? sb.from('maintenance').update(fields).eq('id', m.id)
      : sb.from('maintenance').insert({ ...fields, building_id: buildingId });
    ok(await q);
  },
  async deleteMaintenance(id) {
    ok(await sb.from('maintenance').delete().eq('id', id));
  },

  // ---- resident
  async residentOverview() {
    const { data, error } = await sb.rpc('resident_overview', { p_token: getToken() });
    if (error) {
      if (error.message === 'session_expired') {
        setToken(null);
        notify();
      }
      throw new Error(error.message);
    }
    return {
      ...data,
      unit: flatUnit(data.unit),
      summary: flatSummary(data.summary),
      statement: data.statement.map(flatEntry),
      ledger: data.ledger.map(flatEntry),
      months: data.months.map((m) => ({ month: m.month, collected: num(m.collected), income: num(m.income), spent: num(m.spent) })),
    };
  },
  async residentReport(title, details) {
    ok(await sb.rpc('resident_report', { p_token: getToken(), p_title: title, p_details: details || null }));
  },
};
