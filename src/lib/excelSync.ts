import type { CellChange, Code, Dataset, Employee, Entry, Note, NoteChange } from '../types';
import { fold } from './search';

/**
 * Sincronización en un solo sentido: Excel de SharePoint → app.
 *
 * Se guarda una «foto» de lo último leído del Excel (persona+día → clave y nota).
 * En cada lectura nueva solo se aplican las celdas que han CAMBIADO EN EL EXCEL
 * respecto a esa foto: así lo que se hace solo en la app (tareas, notas con tipo,
 * PC de planificaciones…) se conserva, salvo que esa misma celda cambie después
 * en el Excel, en cuyo caso gana el Excel.
 */

/** Clave de persona: nombre sin tildes, mayúsculas ni espacios de más. */
export const personKey = (nombre: string) => fold(nombre).replace(/\s+/g, ' ').trim();

export interface Snapshot {
  /** persona|fecha → valores del Excel. */
  cells: Map<string, { code?: string; note?: string }>;
  /** Personas que aparecen en el Excel (clave → nombre tal cual). */
  people: Map<string, string>;
}

/** Foto del Excel a partir del resultado del importador. */
export function snapshotOf(ds: Dataset): Snapshot {
  const byId = new Map(ds.employees.map((e) => [e.id, personKey(e.nombre)]));
  const cells: Snapshot['cells'] = new Map();
  const put = (id: string, date: string, v: { code?: string; note?: string }) => {
    const p = byId.get(id);
    if (!p) return;
    const k = `${p}|${date}`;
    cells.set(k, { ...cells.get(k), ...v });
  };
  for (const e of ds.entries) put(e.employeeId, e.date, { code: e.code });
  for (const n of ds.notes ?? []) if (n.text.trim()) put(n.employeeId, n.date, { note: n.text.trim() });
  return { cells, people: new Map(ds.employees.map((e) => [personKey(e.nombre), e.nombre])) };
}

/** Para guardar la foto en IndexedDB. */
export const serializeSnapshot = (s: Snapshot) => ({ cells: [...s.cells], people: [...s.people] });
export const deserializeSnapshot = (x: { cells: [string, { code?: string; note?: string }][]; people: [string, string][] }): Snapshot =>
  ({ cells: new Map(x.cells), people: new Map(x.people) });

export interface SyncPlan {
  cells: CellChange[];
  notes: NoteChange[];
  /** Personas del Excel que no existen en la app (no se crean: se avisa). */
  unknownPeople: string[];
  /** Claves del Excel que no existen en la app (esas celdas no se tocan). */
  unknownCodes: Map<string, number>;
  /** Celdas en las que se ha sustituido algo hecho en la app. */
  overwritten: number;
  /** Personas afectadas (para el resumen). */
  people: number;
}

/**
 * Qué hay que cambiar en la app.
 *  - Con foto anterior: solo lo que ha cambiado en el Excel desde entonces (también borrados).
 *  - Sin foto (primera vez): lo que el Excel tiene y la app no, sin borrar nada de la app.
 */
export function planSync(
  prev: Snapshot | null, next: Snapshot,
  employees: Employee[], entries: Map<string, Entry>, notes: Map<string, Note>, codes: Code[],
): SyncPlan {
  const empByKey = new Map<string, Employee>();
  for (const e of employees) if (!empByKey.has(personKey(e.nombre)) || e.activo) empByKey.set(personKey(e.nombre), e);
  const known = new Set(codes.map((c) => c.code));
  const unknownPeople = [...next.people].filter(([k]) => !empByKey.has(k)).map(([, n]) => n);
  const unknownCodes = new Map<string, number>();
  const cells: CellChange[] = [];
  const noteChanges: NoteChange[] = [];
  let overwritten = 0;

  const keys = new Set([...next.cells.keys(), ...(prev ? prev.cells.keys() : [])]);
  for (const k of keys) {
    const sep = k.lastIndexOf('|');
    const emp = empByKey.get(k.slice(0, sep));
    if (!emp) continue;
    const date = k.slice(sep + 1);
    const before = prev?.cells.get(k);
    const now = next.cells.get(k);
    const appKey = `${emp.id}|${date}`;
    const appCode = entries.get(appKey)?.code ?? null;
    const appNote = notes.get(appKey)?.text?.trim() || null;

    const wantCode = now?.code ?? null;
    const codeChanged = prev ? (before?.code ?? null) !== wantCode : wantCode !== null;
    if (codeChanged && wantCode !== appCode) {
      if (wantCode && !known.has(wantCode)) unknownCodes.set(wantCode, (unknownCodes.get(wantCode) ?? 0) + 1);
      else {
        // ¿Había algo puesto en la app distinto de lo que tenía el Excel? Se sustituye (gana el Excel)
        if (prev && appCode !== (before?.code ?? null)) overwritten++;
        cells.push({ employeeId: emp.id, date, code: wantCode });
      }
    }

    const wantNote = now?.note ?? null;
    const noteChanged = prev ? (before?.note ?? null) !== wantNote : wantNote !== null;
    if (noteChanged && wantNote !== appNote) {
      if (prev && appNote !== (before?.note ?? null)) overwritten++;
      noteChanges.push({ employeeId: emp.id, date, text: wantNote });
    }
  }
  const people = new Set([...cells, ...noteChanges].map((c) => c.employeeId)).size;
  return { cells, notes: noteChanges, unknownPeople, unknownCodes, overwritten, people };
}

/** Minutos sin cambios en el Excel a partir de los cuales se avisa (en horario laboral). */
export const STALE_MINUTES = 120;

/**
 * ¿OneDrive puede estar atascado? Desde el navegador no se ve SharePoint, así que se
 * usa una señal indirecta: en horario laboral (L–V, 8:00–19:00) el Excel se toca a
 * menudo; si la copia local lleva más de 2 h sin cambiar en la jornada, se avisa.
 * Las horas de la noche y del fin de semana no cuentan (lunes a las 8:30 no avisa).
 * Devuelve los minutos «sin cambios» de la jornada, o null si no hay que avisar.
 */
export function staleMinutes(fileTime: Date, now: Date, limit = STALE_MINUTES): number | null {
  const day = now.getDay();
  const h = now.getHours() + now.getMinutes() / 60;
  if (day === 0 || day === 6 || h < 8 || h >= 19) return null;
  const start = new Date(now); start.setHours(8, 0, 0, 0);
  const from = fileTime > start ? fileTime : start;
  const mins = Math.floor((now.getTime() - from.getTime()) / 60000);
  return mins > limit ? mins : null;
}

export type DiffKind = 'code-diff' | 'code-app-only' | 'note-diff' | 'note-app-only';

export interface DiffRow {
  emp: Employee;
  date: string;
  kind: DiffKind;
  app: string | null;
  excel: string | null;
}

/**
 * Comparación COMPLETA entre el Excel y la app (no solo lo que ha cambiado desde
 * la última lectura), dentro de las fechas que cubre el Excel y solo para las
 * personas que están en los dos. Incluye lo que la app tiene y el Excel no
 * (borrados en el Excel, o cosas hechas solo en la app): el usuario elige qué aplicar.
 */
export function fullDiff(
  next: Snapshot, from: string, to: string,
  employees: Employee[], entries: Map<string, Entry>, notes: Map<string, Note>, codes: Code[],
): DiffRow[] {
  const empByKey = new Map<string, Employee>();
  for (const e of employees) if (!empByKey.has(personKey(e.nombre)) || e.activo) empByKey.set(personKey(e.nombre), e);
  const inExcel = new Map<string, Employee>(); // id → emp, solo personas del Excel
  for (const k of next.people.keys()) { const e = empByKey.get(k); if (e) inExcel.set(e.id, e); }
  const known = new Set(codes.map((c) => c.code));
  const rows: DiffRow[] = [];
  const seen = new Set<string>();

  for (const [k, v] of next.cells) {
    const sep = k.lastIndexOf('|');
    const emp = empByKey.get(k.slice(0, sep));
    const date = k.slice(sep + 1);
    if (!emp || date < from || date > to) continue;
    const appKey = `${emp.id}|${date}`;
    seen.add(appKey);
    const appCode = entries.get(appKey)?.code ?? null;
    const appNote = notes.get(appKey)?.text?.trim() || null;
    const xCode = v.code ?? null;
    const xNote = v.note ?? null;
    if (xCode !== appCode && (!xCode || known.has(xCode))) {
      rows.push({ emp, date, kind: xCode ? 'code-diff' : 'code-app-only', app: appCode, excel: xCode });
    }
    if (xNote !== appNote) rows.push({ emp, date, kind: xNote ? 'note-diff' : 'note-app-only', app: appNote, excel: xNote });
  }
  // Lo que la app tiene en días en los que el Excel está vacío
  for (const [appKey, en] of entries) {
    if (seen.has(appKey) || en.date < from || en.date > to) continue;
    const emp = inExcel.get(en.employeeId);
    if (emp) rows.push({ emp, date: en.date, kind: 'code-app-only', app: en.code, excel: null });
  }
  for (const [appKey, n] of notes) {
    if (seen.has(appKey) || n.date < from || n.date > to || !n.text.trim()) continue;
    const emp = inExcel.get(n.employeeId);
    if (emp) rows.push({ emp, date: n.date, kind: 'note-app-only', app: n.text.trim(), excel: null });
  }
  return rows.sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre) || a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Convierte las filas elegidas en cambios para la app (el valor del Excel manda). */
export function rowsToChanges(rows: DiffRow[]): { cells: CellChange[]; notes: NoteChange[] } {
  return {
    cells: rows.filter((r) => r.kind.startsWith('code')).map((r) => ({ employeeId: r.emp.id, date: r.date, code: r.excel })),
    notes: rows.filter((r) => r.kind.startsWith('note')).map((r) => ({ employeeId: r.emp.id, date: r.date, text: r.excel })),
  };
}
