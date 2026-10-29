import type { DataStore } from './store';
import {
  AdminRequiredError, ConflictError, MASS_PEOPLE_LIMIT,
  type AdminStatus, type PresenceUser,
  type AppUser, type CellChange, type ChangeFilter, type ChangeLog, type Code, type Dataset,
  type Employee, type Entry, type LiveEvent, type Note, type NoteChange, type SnapshotInfo,
} from '../types';
import { demoDataset } from './demo';
import { idbGet, idbSet, idbDel } from './idb';
import { colorForName } from '../lib/colors';

const USER_KEY = 'ca-local-user';
const ADMIN_HASH = 'ca-local-admin-hash';
const ADMIN_UNTIL = 'ca-local-admin-until';

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const ek = (employeeId: string, date: string) => `${employeeId}|${date}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

interface State {
  employees: Map<string, Employee>;
  codes: Map<string, Code>;
  entries: Map<string, Entry>;
  notes: Map<string, Note>;
  changes: ChangeLog[];
  seq: number;
  snapshots: SnapshotInfo[];
}

type Op =
  | { kind: 'entry'; employeeId: string; date: string; code: string | null }
  | { kind: 'note'; employeeId: string; date: string; text: string | null }
  | { kind: 'employee'; id: string; value: Employee | null }
  | { kind: 'code'; key: string; value: Code | null };

/**
 * Almacenamiento en el propio navegador (IndexedDB). Sirve para probar la app
 * sin servidor y como demo. Implementa lo mismo que el backend real: historial,
 * deshacer y copias de seguridad. Las pestañas abiertas se sincronizan entre sí.
 */
export class LocalStore implements DataStore {
  readonly mode = 'local' as const;
  private state!: State;
  private ready: Promise<void>;
  private channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('control-ausencias') : null;
  private listeners = new Set<(e: LiveEvent) => void>();

  constructor() {
    this.ready = this.load();
    this.channel?.addEventListener('message', async () => {
      await this.load();
      this.listeners.forEach((l) => l({ type: 'reload' }));
    });
  }

  private async load() {
    const employees = await idbGet<Employee[]>('employees');
    if (!employees) {
      const demo = demoDataset(new Date().getFullYear());
      this.state = {
        employees: new Map(demo.employees.map((e) => [e.id, e])),
        codes: new Map(demo.codes.map((c) => [c.code, c])),
        entries: new Map(demo.entries.map((e) => [ek(e.employeeId, e.date), e])),
        notes: new Map(),
        changes: [],
        seq: 1,
        snapshots: [],
      };
      await this.persist(false);
      await this.createSnapshot('Datos de ejemplo iniciales', true);
      return;
    }
    this.state = {
      employees: new Map(employees.map((e) => [e.id, e])),
      codes: new Map(((await idbGet<Code[]>('codes')) ?? []).map((c) => [c.code, c])),
      entries: new Map(((await idbGet<Entry[]>('entries')) ?? []).map((e) => [ek(e.employeeId, e.date), e])),
      notes: new Map(((await idbGet<Note[]>('notes')) ?? []).map((n) => [ek(n.employeeId, n.date), n])),
      changes: (await idbGet<ChangeLog[]>('changes')) ?? [],
      seq: (await idbGet<number>('seq')) ?? 1,
      snapshots: (await idbGet<SnapshotInfo[]>('snapshots')) ?? [],
    };
  }

  private async persist(broadcast = true) {
    const s = this.state;
    await Promise.all([
      idbSet('employees', [...s.employees.values()]),
      idbSet('codes', [...s.codes.values()]),
      idbSet('entries', [...s.entries.values()]),
      idbSet('notes', [...s.notes.values()]),
      idbSet('changes', s.changes),
      idbSet('seq', s.seq),
      idbSet('snapshots', s.snapshots),
    ]);
    if (broadcast) this.channel?.postMessage('changed');
  }

  private userName(): string {
    return localStorage.getItem(USER_KEY) ?? 'Usuario local';
  }

  // ---------- sesión ----------
  async currentUser(): Promise<AppUser | null> {
    const name = localStorage.getItem(USER_KEY);
    return name ? { id: name, name, email: '', role: 'admin' } : null;
  }
  async signIn(name: string): Promise<AppUser> {
    const clean = name.trim();
    if (!clean) throw new Error('Escribe tu nombre');
    localStorage.setItem(USER_KEY, clean);
    return { id: clean, name: clean, email: '', role: 'admin' };
  }
  async signOut() {
    localStorage.removeItem(USER_KEY);
  }

  // ---------- lectura ----------
  async loadBase() {
    await this.ready;
    return { employees: [...this.state.employees.values()], codes: [...this.state.codes.values()] };
  }
  async loadEntries(from: string, to: string) {
    await this.ready;
    return [...this.state.entries.values()].filter((e) => e.date >= from && e.date <= to);
  }
  async loadNotes(from: string, to: string) {
    await this.ready;
    return [...this.state.notes.values()].filter((n) => n.date >= from && n.date <= to);
  }

  // ---------- núcleo de escritura con historial ----------
  private currentValue(op: Op): unknown {
    const s = this.state;
    if (op.kind === 'entry') return s.entries.get(ek(op.employeeId, op.date))?.code ?? null;
    if (op.kind === 'note') return s.notes.get(ek(op.employeeId, op.date))?.text ?? null;
    if (op.kind === 'employee') return s.employees.get(op.id) ?? null;
    return s.codes.get(op.key) ?? null;
  }

  private async write(ops: Op[], label: string, revertOf: number | null = null): Promise<string> {
    await this.ready;
    const s = this.state;
    const batchId = crypto.randomUUID();
    const ts = new Date().toISOString();
    const user = this.userName();
    for (const op of ops) {
      const oldValue = this.currentValue(op);
      if (op.kind === 'entry') {
        if (same(oldValue, op.code)) continue;
        const key = ek(op.employeeId, op.date);
        if (op.code) s.entries.set(key, { employeeId: op.employeeId, date: op.date, code: op.code, updatedAt: ts, updatedBy: user });
        else s.entries.delete(key);
        s.changes.push(this.log(ts, user, 'entry', oldValue, op.code, op.employeeId, op.date, batchId, label, revertOf));
      } else if (op.kind === 'note') {
        const text = op.text?.trim() ? op.text : null;
        if (same(oldValue, text)) continue;
        const key = ek(op.employeeId, op.date);
        if (text) s.notes.set(key, { employeeId: op.employeeId, date: op.date, text, author: user, updatedAt: ts });
        else s.notes.delete(key);
        s.changes.push(this.log(ts, user, 'note', oldValue, text, op.employeeId, op.date, batchId, label, revertOf));
      } else if (op.kind === 'employee') {
        if (same(oldValue, op.value)) continue;
        if (op.value) s.employees.set(op.id, op.value);
        else s.employees.delete(op.id);
        s.changes.push(this.log(ts, user, 'employee', oldValue, op.value, op.id, null, batchId, label, revertOf));
      } else {
        if (same(oldValue, op.value)) continue;
        if (op.value) s.codes.set(op.key, op.value);
        else s.codes.delete(op.key);
        s.changes.push(this.log(ts, user, 'code', oldValue, op.value, null, null, batchId, label, revertOf));
      }
    }
    await this.persist();
    return batchId;
  }

  private log(
    ts: string, user: string, entity: ChangeLog['entity'], oldValue: unknown, newValue: unknown,
    employeeId: string | null, date: string | null, batchId: string, label: string, revertOf: number | null,
  ): ChangeLog {
    const action = oldValue == null ? 'insert' : newValue == null ? 'delete' : 'update';
    return {
      id: this.state.seq++, ts, userName: user, entity, action, employeeId, date,
      oldValue: oldValue ?? null, newValue: newValue ?? null, batchId, batchLabel: label, revertedBy: null, revertOf,
    };
  }

  private isAdminMode() {
    return Number(localStorage.getItem(ADMIN_UNTIL) ?? 0) > Date.now();
  }

  private requireAdmin(what: string) {
    if (!this.isAdminMode()) throw new AdminRequiredError(`${what} requiere el modo administrador.`);
  }

  async applyChanges(changes: CellChange[], label: string) {
    const people = new Set(changes.map((c) => c.employeeId)).size;
    if (people > MASS_PEOPLE_LIMIT && !this.isAdminMode()) {
      throw new AdminRequiredError(`Este cambio afecta a ${people} personas. Los cambios a más de ${MASS_PEOPLE_LIMIT} personas a la vez requieren el modo administrador.`);
    }
    return this.write(changes.map((c) => ({ kind: 'entry' as const, ...c })), label);
  }

  async applyNotes(changes: NoteChange[], label: string) {
    return this.write(changes.map((c) => ({ kind: 'note' as const, ...c })), label);
  }

  async saveEmployee(e: Employee) {
    this.requireAdmin('Gestionar personas');
    await this.write([{ kind: 'employee', id: e.id, value: e }], this.state.employees.has(e.id) ? `Edita ficha de ${e.nombre}` : `Alta de ${e.nombre}`);
    return e;
  }

  async saveCode(c: Code) {
    this.requireAdmin('Cambiar las claves');
    await this.write([{ kind: 'code', key: c.code, value: c }], `Clave ${c.code}`);
  }

  async deleteEmployee(id: string) {
    this.requireAdmin('Eliminar personas');
    await this.ready;
    const emp = this.state.employees.get(id);
    const ops: Op[] = [...this.state.entries.values()]
      .filter((x) => x.employeeId === id)
      .map((x) => ({ kind: 'entry', employeeId: id, date: x.date, code: null }));
    for (const n of this.state.notes.values()) {
      if (n.employeeId === id) ops.push({ kind: 'note', employeeId: id, date: n.date, text: null });
    }
    ops.push({ kind: 'employee', id, value: null });
    await this.write(ops, `Elimina a ${emp?.nombre ?? 'persona'}`);
  }

  // ---------- historial ----------
  async listChanges(f: ChangeFilter) {
    await this.ready;
    return [...this.state.changes]
      .reverse()
      .filter((c) => (f.beforeId == null || c.id < f.beforeId)
        && (!f.userName || c.userName === f.userName)
        && (!f.employeeId || c.employeeId === f.employeeId))
      .slice(0, f.limit);
  }

  async listUsers() {
    await this.ready;
    return [...new Set(this.state.changes.map((c) => c.userName))].sort();
  }

  private inverse(c: ChangeLog): Op {
    if (c.entity === 'entry') return { kind: 'entry', employeeId: c.employeeId!, date: c.date!, code: (c.oldValue as string) ?? null };
    if (c.entity === 'note') return { kind: 'note', employeeId: c.employeeId!, date: c.date!, text: (c.oldValue as string) ?? null };
    if (c.entity === 'employee') return { kind: 'employee', id: c.employeeId!, value: (c.oldValue as Employee) ?? null };
    const key = ((c.oldValue ?? c.newValue) as Code).code;
    return { kind: 'code', key, value: (c.oldValue as Code) ?? null };
  }

  private async revert(list: ChangeLog[], force: boolean, label: string) {
    const pending = list.filter((c) => c.revertedBy == null && c.entity !== 'system');
    if (!pending.length) throw new Error('Este cambio ya estaba deshecho.');
    if (!force) {
      const changed = pending.filter((c) => {
        const inv = this.inverse(c);
        return !same(this.currentValue(inv), c.newValue);
      });
      if (changed.length) throw new ConflictError(`${changed.length} dato(s) se han vuelto a modificar después de este cambio.`);
    }
    const ops = [...pending].sort((a, b) => b.id - a.id).map((c) => this.inverse(c));
    const firstNew = this.state.seq;
    await this.write(ops, label, pending[0].id);
    pending.forEach((c) => { c.revertedBy = firstNew; });
    await this.persist();
  }

  async revertChange(id: number, force: boolean) {
    await this.ready;
    const c = this.state.changes.find((x) => x.id === id);
    if (!c) throw new Error('Cambio no encontrado');
    await this.revert([c], force, `Deshacer: ${c.batchLabel ?? 'cambio'}`);
  }

  async revertBatch(batchId: string, force: boolean) {
    await this.ready;
    const list = this.state.changes.filter((x) => x.batchId === batchId);
    await this.revert(list, force, `Deshacer: ${list[0]?.batchLabel ?? 'cambios'}`);
  }

  // ---------- copias de seguridad ----------
  private dataset(): Dataset {
    const s = this.state;
    return {
      employees: [...s.employees.values()], codes: [...s.codes.values()],
      entries: [...s.entries.values()], notes: [...s.notes.values()],
    };
  }

  async listSnapshots() {
    await this.ready;
    return [...this.state.snapshots].sort((a, b) => b.id - a.id);
  }

  async createSnapshot(label: string, auto = false) {
    const data = this.dataset();
    const id = (this.state.snapshots.reduce((m, x) => Math.max(m, x.id), 0)) + 1;
    await idbSet(`snap:${id}`, data);
    this.state.snapshots.push({
      id, createdAt: new Date().toISOString(), label, createdBy: this.userName(), auto,
      employees: data.employees.length, entries: data.entries.length,
    });
    // Conservar como mucho 30 copias automáticas
    const autos = this.state.snapshots.filter((x) => x.auto).sort((a, b) => b.id - a.id);
    for (const old of autos.slice(30)) {
      await idbDel(`snap:${old.id}`);
      this.state.snapshots = this.state.snapshots.filter((x) => x.id !== old.id);
    }
    await this.persist();
  }

  async getSnapshot(id: number) {
    const d = await idbGet<Dataset>(`snap:${id}`);
    if (!d) throw new Error('Copia no encontrada');
    return d;
  }

  private async replaceAll(d: Dataset, label: string, action: 'restore' | 'import') {
    await this.createSnapshot(`Automática antes de: ${label}`, true);
    const s = this.state;
    s.employees = new Map(d.employees.map((e) => [e.id, e]));
    s.codes = new Map(d.codes.map((c) => [c.code, c]));
    s.entries = new Map(d.entries.map((e) => [ek(e.employeeId, e.date), e]));
    s.notes = new Map((d.notes ?? []).map((n) => [ek(n.employeeId, n.date), n]));
    s.changes.push({
      id: s.seq++, ts: new Date().toISOString(), userName: this.userName(), entity: 'system', action,
      employeeId: null, date: null, oldValue: null, newValue: { employees: d.employees.length, entries: d.entries.length },
      batchId: crypto.randomUUID(), batchLabel: label, revertedBy: null, revertOf: null,
    });
    await this.persist();
  }

  async restoreSnapshot(id: number) {
    this.requireAdmin('Restaurar copias');
    const snap = this.state.snapshots.find((x) => x.id === id);
    await this.replaceAll(await this.getSnapshot(id), `Restaura copia "${snap?.label ?? id}"`, 'restore');
  }

  async importDataset(d: Dataset, label: string) {
    this.requireAdmin('Importar datos');
    await this.replaceAll(d, label, 'import');
  }

  // ---------- tiempo real (entre pestañas) ----------
  subscribe(cb: (e: LiveEvent) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  // ---------- presencia entre pestañas (simula a varios compañeros) ----------
  private presenceId = crypto.randomUUID();
  private presenceChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ca-presence') : null;
  private peers = new Map<string, PresenceUser & { ts: number }>();
  private myCell: PresenceUser['cell'] = null;

  private announce() {
    const name = this.userName();
    this.presenceChannel?.postMessage({ key: this.presenceId, name, color: colorForName(name), cell: this.myCell, ts: Date.now() });
  }

  onPresence(cb: (users: PresenceUser[]) => void) {
    const emit = () => {
      const now = Date.now();
      for (const [k, p] of this.peers) if (now - p.ts > 6000) this.peers.delete(k);
      const name = this.userName();
      cb([{ key: 'me', name, color: colorForName(name), cell: this.myCell }, ...[...this.peers.values()].map(({ ts: _ts, ...u }) => u)]);
    };
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data as PresenceUser & { ts: number; bye?: boolean };
      if (m.key === this.presenceId) return;
      if (m.bye) this.peers.delete(m.key); else this.peers.set(m.key, m);
      emit();
    };
    this.presenceChannel?.addEventListener('message', onMsg);
    this.announce();
    const timer = setInterval(() => { this.announce(); emit(); }, 2000);
    emit();
    return () => {
      clearInterval(timer);
      this.presenceChannel?.removeEventListener('message', onMsg);
      this.presenceChannel?.postMessage({ key: this.presenceId, bye: true });
    };
  }

  setCursor(cell: PresenceUser['cell']) {
    this.myCell = cell;
    this.announce();
  }

  // ---------- modo administrador (contraseña guardada cifrada en este navegador) ----------
  async adminStatus(): Promise<AdminStatus> {
    const until = Number(localStorage.getItem(ADMIN_UNTIL) ?? 0);
    return {
      configured: !!localStorage.getItem(ADMIN_HASH),
      until: until > Date.now() ? new Date(until).toISOString() : null,
      canManage: true,
    };
  }

  async adminUnlock(password: string) {
    const hash = localStorage.getItem(ADMIN_HASH);
    if (!hash) throw new Error('Todavía no hay contraseña de administrador: créala desde Ajustes.');
    if ((await sha256(password)) !== hash) return null;
    const until = Date.now() + 4 * 3600 * 1000;
    localStorage.setItem(ADMIN_UNTIL, String(until));
    return new Date(until).toISOString();
  }

  async adminLock() {
    localStorage.removeItem(ADMIN_UNTIL);
  }

  async setAdminPassword(current: string | null, next: string) {
    if (next.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    const hash = localStorage.getItem(ADMIN_HASH);
    if (hash && (await sha256(current ?? '')) !== hash) throw new Error('La contraseña actual no es correcta');
    localStorage.setItem(ADMIN_HASH, await sha256(next));
  }
}
