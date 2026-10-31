import type { CellChange, Code, Employee, Entry, Note, OpsConfig } from '../types';
import { addDays, dateRange, isWeekend, parseIso, weekday } from './dates';

/**
 * Cálculos de la operativa: cobertura por zona, disponibilidad, carga de
 * presencial y saldos. Funciones puras (sin React) para poder probarlas.
 *
 * Reglas:
 *  - Técnico de campo = persona activa de uno de los equipos configurados.
 *  - «Fuera» = clave de tipo ausencia (V, B, P, F…) salvo FN/FL, que son «festivo».
 *  - PC y sus medias jornadas = trabajando, pero en cliente (ocupado).
 *  - Cualquier otra clave de control (TS, TT, CZ…) o sin clave = disponible.
 */

export const HOLIDAY_CODES = ['FN', 'FL'];
export const isPcCode = (code: string | undefined) => !!code && code.toUpperCase().startsWith('PC');
/** PC cuenta 1 día; PC de media jornada, medio. */
export const pcWeight = (code: string | undefined) => (!isPcCode(code) ? 0 : /MJ/i.test(code!) ? 0.5 : 1);

const k = (id: string, date: string) => `${id}|${date}`;

export type DayStatus = 'libre' | 'pc' | 'fuera' | 'festivo';

export function dayStatus(code: string | undefined, absence: Set<string>): DayStatus {
  if (!code) return 'libre';
  if (HOLIDAY_CODES.includes(code)) return 'festivo';
  if (absence.has(code)) return 'fuera';
  if (isPcCode(code)) return 'pc';
  return 'libre';
}

export const absenceSet = (codes: Code[]) => new Set(codes.filter((c) => c.category === 'ausencia').map((c) => c.code));

export function fieldStaff(employees: Employee[], cfg: OpsConfig): Employee[] {
  const eq = new Set(cfg.equipos);
  return employees.filter((e) => e.activo && eq.has(e.equipo));
}

export const zoneMin = (cfg: OpsConfig, zona: string) => Math.max(0, cfg.zonas[zona]?.minimo ?? 1);

/** Zonas de los técnicos de campo, ordenadas. */
export function zonesOf(staff: Employee[]): string[] {
  return [...new Set(staff.map((e) => e.zona || '(sin zona)'))].sort((a, b) => a.localeCompare(b));
}

export type Level = 'ok' | 'justo' | 'bajo' | 'festivo';

export interface ZoneDay {
  zona: string;
  date: string;
  total: number;
  min: number;
  /** Trabajando (libres + en cliente). */
  working: number;
  libres: Employee[];
  enCliente: { emp: Employee; code: string; note?: string }[];
  fuera: { emp: Employee; code: string; note?: string }[];
  festivo: { emp: Employee; code: string; note?: string }[];
  level: Level;
}

/**
 * Nivel de cobertura de una zona un día:
 *  - festivo: no trabaja nadie y todos los que faltan es por FN/FL.
 *  - bajo (rojo): trabajan menos del mínimo.
 *  - justo (ámbar): falta alguien y se está justo en el mínimo.
 *  - ok (verde).
 */
export function zoneDay(
  zona: string, date: string, staff: Employee[], entries: Map<string, Entry>, notes: Map<string, Note>,
  absence: Set<string>, cfg: OpsConfig,
): ZoneDay {
  const people = staff.filter((e) => (e.zona || '(sin zona)') === zona);
  const out: ZoneDay = { zona, date, total: people.length, min: Math.min(zoneMin(cfg, zona), people.length), working: 0, libres: [], enCliente: [], fuera: [], festivo: [], level: 'ok' };
  for (const emp of people) {
    const code = entries.get(k(emp.id, date))?.code;
    const note = notes.get(k(emp.id, date))?.text;
    const st = dayStatus(code, absence);
    if (st === 'libre') out.libres.push(emp);
    else if (st === 'pc') out.enCliente.push({ emp, code: code!, note });
    else if (st === 'fuera') out.fuera.push({ emp, code: code!, note });
    else out.festivo.push({ emp, code: code!, note });
  }
  out.working = out.libres.length + out.enCliente.length;
  if (out.working === 0 && out.festivo.length > 0 && out.fuera.length === 0) out.level = 'festivo';
  else if (out.working < out.min) out.level = 'bajo';
  else if (out.working === out.min && out.working < out.total) out.level = 'justo';
  return out;
}

/** Días laborables (L–V) de la semana que contiene la fecha. */
export function workWeek(date: string): string[] {
  const monday = addDays(date, -((weekday(date) + 6) % 7));
  return dateRange(monday, addDays(monday, 4));
}

/** Carga de presencial (PC) por persona entre dos fechas. */
export function pcLoad(staff: Employee[], entries: Map<string, Entry>, from: string, to: string): Map<string, number> {
  const ids = new Set(staff.map((e) => e.id));
  const out = new Map(staff.map((e) => [e.id, 0]));
  for (const e of entries.values()) {
    if (e.date < from || e.date > to || !ids.has(e.employeeId)) continue;
    const w = pcWeight(e.code);
    if (w) out.set(e.employeeId, (out.get(e.employeeId) ?? 0) + w);
  }
  return out;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Candidate {
  emp: Employee;
  /** 0 = de la zona, 1 = zona vecina, 2 = otra zona. */
  rank: 0 | 1 | 2;
  status: 'libre' | 'pc';
  code?: string;
  note?: string;
  weekLoad: number;
  monthLoad: number;
}

/**
 * ¿Quién puede ir a una zona un día? Primero los de la zona, luego vecinas y
 * (si se pide) el resto. Dentro de cada grupo: libres antes que en cliente y
 * menos carga de PC esa semana y ese mes primero.
 */
export function candidates(
  zona: string, date: string, staff: Employee[], entries: Map<string, Entry>, notes: Map<string, Note>,
  absence: Set<string>, cfg: OpsConfig, opts: { allZones?: boolean; exclude?: Set<string> } = {},
): Candidate[] {
  const vecinas = new Set(cfg.zonas[zona]?.vecinas ?? []);
  const week = workWeek(date);
  const { y, m0 } = parseIso(date);
  const mFrom = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
  const mTo = `${y}-${String(m0 + 1).padStart(2, '0')}-31`;
  const wl = pcLoad(staff, entries, week[0], week[4]);
  const ml = pcLoad(staff, entries, mFrom, mTo);
  const out: Candidate[] = [];
  for (const emp of staff) {
    if (opts.exclude?.has(emp.id)) continue;
    const z = emp.zona || '(sin zona)';
    const rank = z === zona ? 0 : vecinas.has(z) ? 1 : 2;
    if (rank === 2 && !opts.allZones) continue;
    const code = entries.get(k(emp.id, date))?.code;
    const st = dayStatus(code, absence);
    if (st === 'fuera' || st === 'festivo') continue;
    out.push({ emp, rank, status: st, code, note: notes.get(k(emp.id, date))?.text, weekLoad: wl.get(emp.id) ?? 0, monthLoad: ml.get(emp.id) ?? 0 });
  }
  return out.sort((a, b) => a.rank - b.rank || (a.status === b.status ? 0 : a.status === 'libre' ? -1 : 1)
    || a.weekLoad - b.weekLoad || a.monthLoad - b.monthLoad || a.emp.nombre.localeCompare(b.emp.nombre));
}

export interface CoverageWarning { zona: string; date: string; working: number; min: number }

/**
 * Avisos al marcar ausencias: zonas que pasan a estar por debajo de su mínimo
 * por culpa de estos cambios (solo días laborables y técnicos de campo).
 */
export function coverageImpact(
  changes: CellChange[], employees: Employee[], entries: Map<string, Entry>, codes: Code[], cfg: OpsConfig,
): CoverageWarning[] {
  const staff = fieldStaff(employees, cfg);
  const byId = new Map(staff.map((e) => [e.id, e]));
  const absence = absenceSet(codes);
  const touched = changes.filter((c) => byId.has(c.employeeId) && !isWeekend(c.date));
  if (!touched.length) return [];
  const after = new Map(entries);
  for (const c of touched) {
    if (c.code) after.set(k(c.employeeId, c.date), { employeeId: c.employeeId, date: c.date, code: c.code });
    else after.delete(k(c.employeeId, c.date));
  }
  const pairs = new Map<string, { zona: string; date: string }>();
  for (const c of touched) {
    const zona = byId.get(c.employeeId)!.zona || '(sin zona)';
    pairs.set(`${zona}|${c.date}`, { zona, date: c.date });
  }
  const none = new Map<string, Note>();
  const out: CoverageWarning[] = [];
  for (const { zona, date } of pairs.values()) {
    const before = zoneDay(zona, date, staff, entries, none, absence, cfg);
    const now = zoneDay(zona, date, staff, after, none, absence, cfg);
    if (now.level === 'bajo' && now.working < before.working) out.push({ zona, date, working: now.working, min: now.min });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.zona.localeCompare(b.zona));
}

export interface Balance {
  emp: Employee;
  vac: number;
  vacUsed: number;
  vacLeft: number;
  vpLeft: number;
  /** Festivos y sábados trabajados (TF + TS). */
  worked: number;
  /** Libres disfrutados (Lf + Lh). */
  compensated: number;
  pc: number;
  bajas: number;
}

export function balances(employees: Employee[], entries: Map<string, Entry>, year: number): Balance[] {
  const map = new Map<string, Balance>(employees.map((e) => [e.id, {
    emp: e, vac: e.diasVacaciones, vacUsed: 0, vacLeft: e.diasVacaciones, vpLeft: e.vpPendientes, worked: 0, compensated: 0, pc: 0, bajas: 0,
  }]));
  const prefix = `${year}-`;
  for (const en of entries.values()) {
    if (!en.date.startsWith(prefix)) continue;
    const b = map.get(en.employeeId);
    if (!b) continue;
    if (en.code === 'V') { b.vacUsed++; b.vacLeft--; }
    else if (en.code === 'VP') b.vpLeft--;
    else if (en.code === 'TF' || en.code === 'TS') b.worked++;
    else if (en.code === 'Lf' || en.code === 'Lh') b.compensated++;
    else if (en.code === 'B') b.bajas++;
    b.pc += pcWeight(en.code);
  }
  return [...map.values()];
}

/** Bajas (B) en curso a una fecha: días seguidos (contando hacia atrás) hasta hoy. */
export function ongoingSickLeaves(employees: Employee[], entries: Map<string, Entry>, today: string): { emp: Employee; since: string; days: number }[] {
  const out: { emp: Employee; since: string; days: number }[] = [];
  for (const emp of employees) {
    if (entries.get(k(emp.id, today))?.code !== 'B') continue;
    let d = today; let since = today; let days = 0;
    // Retrocede saltando fines de semana sin marca (la baja suele marcarse solo L–V)
    for (let i = 0; i < 400; i++) {
      const code = entries.get(k(emp.id, d))?.code;
      if (code === 'B') { since = d; days++; } else if (!(isWeekend(d) && !code)) break;
      d = addDays(d, -1);
    }
    out.push({ emp, since, days });
  }
  return out.sort((a, b) => b.days - a.days);
}

export interface DataIssue { emp: Employee; problems: string[] }

/** Revisión de calidad de datos (lo que haría fallar cobertura, saldos o la planificación). */
export function dataIssues(employees: Employee[], entries: Map<string, Entry>, codes: Code[], cfg: OpsConfig, year: number): {
  people: DataIssue[]; unknownCodes: Map<string, number>; reviewCodes: Map<string, number>;
} {
  const field = new Set(fieldStaff(employees, cfg).map((e) => e.id));
  const people: DataIssue[] = [];
  for (const e of employees.filter((x) => x.activo)) {
    const p: string[] = [];
    if (field.has(e.id) && !e.siglas?.trim()) p.push('Sin siglas (la planificación no la encontrará)');
    if (!e.zona?.trim()) p.push('Sin zona');
    if (!e.equipo?.trim()) p.push('Sin equipo');
    if (!(e.diasVacaciones > 0)) p.push('Sin días de vacaciones');
    else if (e.diasVacaciones > 40) p.push(`Días de vacaciones raros (${e.diasVacaciones})`);
    if (p.length) people.push({ emp: e, problems: p });
  }
  const known = new Set(codes.map((c) => c.code));
  const review = new Set(codes.filter((c) => /revisar/i.test(c.label)).map((c) => c.code));
  const unknownCodes = new Map<string, number>();
  const reviewCodes = new Map<string, number>();
  for (const en of entries.values()) {
    if (!en.date.startsWith(`${year}-`)) continue;
    if (!known.has(en.code)) unknownCodes.set(en.code, (unknownCodes.get(en.code) ?? 0) + 1);
    else if (review.has(en.code)) reviewCodes.set(en.code, (reviewCodes.get(en.code) ?? 0) + 1);
  }
  return { people, unknownCodes, reviewCodes };
}
