import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { DataStore } from './store';
import {
  ConflictError,
  type AppUser, type CellChange, type ChangeFilter, type ChangeLog, type Code, type Dataset,
  type Employee, type Entry, type LiveEvent, type Note, type NoteChange, type SnapshotInfo,
} from '../types';

// ---------- conversión filas SQL (snake_case) <-> app (camelCase) ----------
type Row = Record<string, unknown>;

const empFromRow = (r: Row): Employee => ({
  id: r.id as string,
  nombre: (r.nombre as string) ?? '',
  telefono: (r.telefono as string) ?? '',
  extension: (r.extension as string) ?? '',
  almacen: (r.almacen as string) ?? '',
  teamLeader: (r.team_leader as string) ?? '',
  equipo: (r.equipo as string) ?? '',
  zona: (r.zona as string) ?? '',
  guardias: (r.guardias as string) ?? '',
  sede: (r.sede as string) ?? '',
  diasVacaciones: Number(r.dias_vacaciones ?? 0),
  vpPendientes: Number(r.vp_pendientes ?? 0),
  diasLh: Number(r.dias_lh ?? 0),
  notas: (r.notas as string) ?? '',
  orden: Number(r.orden ?? 0),
  activo: r.activo !== false,
});

const empToRow = (e: Employee): Row => ({
  id: e.id, nombre: e.nombre, telefono: e.telefono, extension: e.extension, almacen: e.almacen,
  team_leader: e.teamLeader, equipo: e.equipo, zona: e.zona, guardias: e.guardias, sede: e.sede,
  dias_vacaciones: e.diasVacaciones, vp_pendientes: e.vpPendientes, dias_lh: e.diasLh,
  notas: e.notas, orden: e.orden, activo: e.activo,
});

const codeFromRow = (r: Row): Code => ({
  code: r.code as string,
  label: r.label as string,
  color: r.color as string,
  textColor: r.text_color as string,
  category: r.category as Code['category'],
  orden: Number(r.orden ?? 0),
  activo: r.activo !== false,
});

const codeToRow = (c: Code): Row => ({
  code: c.code, label: c.label, color: c.color, text_color: c.textColor,
  category: c.category, orden: c.orden, activo: c.activo,
});

const entryFromRow = (r: Row): Entry => ({
  employeeId: r.employee_id as string,
  date: r.day as string,
  code: r.code as string,
  updatedAt: r.updated_at as string | undefined,
  updatedBy: r.updated_by as string | undefined,
});

const noteFromRow = (r: Row): Note => ({
  employeeId: r.employee_id as string,
  date: r.day as string,
  text: (r.text as string) ?? '',
  author: (r.author as string) ?? '',
  updatedAt: r.updated_at as string | undefined,
});

const logFromRow = (r: Row): ChangeLog => {
  const conv = (v: unknown) => {
    if (v == null || typeof v !== 'object') return v ?? null;
    const o = v as Row;
    if (r.entity === 'employee') return empFromRow(o);
    if (r.entity === 'code') return codeFromRow(o);
    return v;
  };
  return {
    id: Number(r.id),
    ts: r.ts as string,
    userName: r.user_name as string,
    entity: r.entity as ChangeLog['entity'],
    action: r.action as ChangeLog['action'],
    employeeId: (r.employee_id as string) ?? null,
    date: (r.day as string) ?? null,
    oldValue: conv(r.old_value),
    newValue: conv(r.new_value),
    batchId: (r.batch_id as string) ?? null,
    batchLabel: (r.batch_label as string) ?? null,
    revertedBy: r.reverted_by == null ? null : Number(r.reverted_by),
    revertOf: r.revert_of == null ? null : Number(r.revert_of),
  };
};

function fail(error: { message: string } | null) {
  if (!error) return;
  const msg = error.message ?? 'Error desconocido';
  if (msg.includes('CONFLICT:')) throw new ConflictError(msg.split('CONFLICT:')[1].trim());
  throw new Error(msg);
}

/**
 * Backend compartido: PostgreSQL en Supabase. El historial lo escribe la propia
 * base de datos con triggers (no se puede falsear desde el navegador) y los
 * cambios llegan al resto de compañeros al instante por Realtime.
 */
export class SupabaseStore implements DataStore {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  private user: AppUser | null = null;
  private presence: RealtimeChannel | null = null;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  // ---------- sesión ----------
  private async profile(id: string, email: string): Promise<AppUser> {
    const { data } = await this.sb.from('profiles').select('display_name, role').eq('id', id).maybeSingle();
    this.user = {
      id, email,
      name: (data?.display_name as string) ?? email.split('@')[0],
      role: ((data?.role as AppUser['role']) ?? 'lector'),
    };
    return this.user;
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? this.profile(u.id, u.email ?? '') : null;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos' : error.message);
    return this.profile(data.user.id, data.user.email ?? '');
  }

  async signOut() {
    await this.presence?.unsubscribe();
    await this.sb.auth.signOut();
    this.user = null;
  }

  async resetPassword(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.href });
    fail(error);
  }

  // ---------- lectura ----------
  /** Supabase devuelve como mucho 1000 filas por consulta: se pagina. */
  private async all(table: string, build: (q: any) => any, select = '*'): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(this.sb.from(table).select(select)).range(from, from + 999);
      fail(error);
      out.push(...(data as Row[]));
      if (!data || data.length < 1000) return out;
    }
  }

  async loadBase() {
    const [emps, codes] = await Promise.all([
      this.all('employees', (q) => q.order('orden').order('id')),
      this.all('codes', (q) => q.order('orden')),
    ]);
    return { employees: emps.map(empFromRow), codes: codes.map(codeFromRow) };
  }

  async loadEntries(from: string, to: string) {
    const rows = await this.all('entries', (q) => q.gte('day', from).lte('day', to).order('day').order('employee_id'));
    return rows.map(entryFromRow);
  }

  async loadNotes(from: string, to: string) {
    const rows = await this.all('notes', (q) => q.gte('day', from).lte('day', to).order('day').order('employee_id'));
    return rows.map(noteFromRow);
  }

  // ---------- escritura ----------
  async applyChanges(changes: CellChange[], label: string) {
    // Lotes de 2000 celdas para no superar el tamaño de petición.
    let batch: string | null = null;
    for (let i = 0; i < changes.length; i += 2000) {
      const part = changes.slice(i, i + 2000).map((c) => ({ employee_id: c.employeeId, day: c.date, code: c.code }));
      const { data, error } = await this.sb.rpc('apply_entries', { p_changes: part, p_label: label });
      fail(error);
      // Si hubo varios trozos, solo el último se puede deshacer con un clic (raro: >2000 celdas)
      batch = (data as string) ?? null;
    }
    return changes.length > 2000 ? null : batch;
  }

  async applyNotes(changes: NoteChange[], label: string) {
    const { data, error } = await this.sb.rpc('apply_notes', {
      p_changes: changes.map((c) => ({ employee_id: c.employeeId, day: c.date, text: c.text })),
      p_label: label,
    });
    fail(error);
    return (data as string) ?? null;
  }

  async saveEmployee(e: Employee) {
    const { data: exists } = await this.sb.from('employees').select('id').eq('id', e.id).maybeSingle();
    const { error } = await this.sb.rpc('save_employee', {
      p_emp: empToRow(e), p_label: exists ? `Edita ficha de ${e.nombre}` : `Alta de ${e.nombre}`,
    });
    fail(error);
    return e;
  }

  async saveCode(c: Code) {
    const { error } = await this.sb.rpc('save_code', { p_code: codeToRow(c), p_label: `Clave ${c.code}` });
    fail(error);
  }

  async deleteEmployee(id: string) {
    const { data } = await this.sb.from('employees').select('nombre').eq('id', id).maybeSingle();
    const { error } = await this.sb.rpc('delete_employee', { p_id: id, p_label: `Elimina a ${data?.nombre ?? 'persona'}` });
    fail(error);
  }

  // ---------- historial ----------
  async listChanges(f: ChangeFilter) {
    let q = this.sb.from('change_log').select('*').order('id', { ascending: false }).limit(f.limit);
    if (f.beforeId != null) q = q.lt('id', f.beforeId);
    if (f.userName) q = q.eq('user_name', f.userName);
    if (f.employeeId) q = q.eq('employee_id', f.employeeId);
    const { data, error } = await q;
    fail(error);
    return (data as Row[]).map(logFromRow);
  }

  async listUsers() {
    const { data, error } = await this.sb.from('profiles').select('display_name').order('display_name');
    fail(error);
    return (data as Row[]).map((r) => r.display_name as string);
  }

  async revertChange(id: number, force: boolean) {
    const { error } = await this.sb.rpc('revert_changes', { p_ids: [id], p_force: force });
    fail(error);
  }

  async revertBatch(batchId: string, force: boolean) {
    const { error } = await this.sb.rpc('revert_batch', { p_batch: batchId, p_force: force });
    fail(error);
  }

  // ---------- copias ----------
  async listSnapshots(): Promise<SnapshotInfo[]> {
    const { data, error } = await this.sb.from('snapshots')
      .select('id, created_at, label, created_by, auto, employees_count, entries_count')
      .order('id', { ascending: false });
    fail(error);
    return (data as Row[]).map((r) => ({
      id: Number(r.id), createdAt: r.created_at as string, label: r.label as string,
      createdBy: r.created_by as string, auto: !!r.auto,
      employees: Number(r.employees_count), entries: Number(r.entries_count),
    }));
  }

  async createSnapshot(label: string) {
    const { error } = await this.sb.rpc('create_snapshot', { p_label: label, p_auto: false });
    fail(error);
  }

  async getSnapshot(id: number): Promise<Dataset> {
    const { data, error } = await this.sb.from('snapshots').select('data').eq('id', id).single();
    fail(error);
    const d = data!.data as { employees: Row[]; codes: Row[]; entries: Row[]; notes?: Row[] };
    return {
      employees: d.employees.map(empFromRow),
      codes: d.codes.map(codeFromRow),
      entries: d.entries.map(entryFromRow),
      notes: (d.notes ?? []).map(noteFromRow),
    };
  }

  async restoreSnapshot(id: number) {
    const { error } = await this.sb.rpc('restore_snapshot', { p_id: id });
    fail(error);
  }

  async importDataset(d: Dataset, label: string) {
    const { error } = await this.sb.rpc('replace_all', {
      p_data: {
        employees: d.employees.map(empToRow),
        codes: d.codes.map(codeToRow),
        entries: d.entries.map((e) => ({ employee_id: e.employeeId, day: e.date, code: e.code })),
        notes: (d.notes ?? []).map((n) => ({ employee_id: n.employeeId, day: n.date, text: n.text, author: n.author })),
      },
      p_label: label,
      p_action: 'import',
    });
    fail(error);
  }

  // ---------- tiempo real ----------
  subscribe(cb: (e: LiveEvent) => void) {
    let first = true;
    const ch = this.sb.channel('cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as Row;
        cb({
          type: 'entry',
          entry: p.eventType === 'DELETE' ? null : entryFromRow(row),
          employeeId: row.employee_id as string,
          date: row.day as string,
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as Row;
        cb({
          type: 'note',
          note: p.eventType === 'DELETE' ? null : noteFromRow(row),
          employeeId: row.employee_id as string,
          date: row.day as string,
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as Row;
        cb({ type: 'employee', employee: p.eventType === 'DELETE' ? null : empFromRow(row), id: row.id as string });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'codes' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as Row;
        cb({ type: 'code', code: p.eventType === 'DELETE' ? null : codeFromRow(row), key: row.code as string });
      })
      .subscribe((status) => {
        // Si se corta la conexión y vuelve, se recarga todo para no perder nada.
        if (status === 'SUBSCRIBED') {
          if (!first) cb({ type: 'reload' });
          first = false;
        }
      });
    return () => { this.sb.removeChannel(ch); };
  }

  onPresence(cb: (names: string[]) => void) {
    const me = this.user?.name ?? 'Anónimo';
    const ch = this.sb.channel('conectados', { config: { presence: { key: crypto.randomUUID() } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ name: string }>();
      const names = Object.values(state).flat().map((x) => x.name);
      cb([...new Set(names)].sort());
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ name: me });
    });
    this.presence = ch;
    return () => { this.sb.removeChannel(ch); };
  }
}
