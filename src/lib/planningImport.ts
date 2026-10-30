import type { CellChange, Employee, Entry, Note, NoteChange } from '../types';
import { readAllSheets } from './excelImport';
import { normSiglas } from './siglas';
import { iso } from './dates';

/**
 * Importador de planificaciones (p. ej. «DIA. NOVIEMBRE. PLANIFICACION FINAL.xlsx»):
 * cada fila es una visita con fecha, hora, lugar y las SIGLAS de quien va.
 * Reglas acordadas:
 *  - Se marca siempre PC (presencial en cliente) y en la nota: motivo · lugar · hora.
 *  - Si ese día la persona ya tiene OTRA clave, no se toca y se avisa.
 *  - Si ya tiene PC, se respeta y solo se añade la nota (sin duplicarla).
 */

export const PLAN_CODE = 'PC';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface PlanSheet {
  name: string;
  headerRow: number;
  headers: { col: number; title: string }[];
  rows: Map<number, Map<number, string>>; // solo filas de datos
}

export interface PlanColumns {
  date: number;
  time: number | null;
  siglas: number;
  /** Columnas que forman el lugar en la nota (tienda, dirección…). */
  place: number[];
}

const RE_DATE = /^fecha/;
const RE_TIME = /^hora/;
const RE_SIGLAS = /siglas|instalador|tecnico|recurso|asignad|empresa instaladora/;
const PLACE_ORDER = [/^tipo de tienda$/, /^tienda$/, /direccion/, /localidad|poblacion|municipio/, /provincia/];

/** Busca la hoja y la fila de cabecera que tienen una fecha y unas siglas. */
export function readPlanning(buffer: ArrayBuffer | Uint8Array): { sheets: PlanSheet[]; best: PlanSheet | null; guess: PlanColumns | null } {
  const sheets: PlanSheet[] = [];
  for (const sh of readAllSheets(buffer)) {
    const rowNums = [...sh.cells.keys()].sort((a, b) => a - b);
    const headerRow = rowNums.slice(0, 15).find((r) => {
      const t = [...(sh.cells.get(r)?.values() ?? [])].map(norm);
      return t.some((x) => RE_DATE.test(x)) && t.some((x) => RE_SIGLAS.test(x));
    });
    if (headerRow == null) continue;
    const headers = [...sh.cells.get(headerRow)!].sort((a, b) => a[0] - b[0]).map(([col, title]) => ({ col, title: title.trim() }));
    const rows = new Map(rowNums.filter((r) => r > headerRow).map((r) => [r, sh.cells.get(r)!]));
    sheets.push({ name: sh.name, headerRow, headers, rows });
  }
  const best = sheets.sort((a, b) => b.rows.size - a.rows.size)[0] ?? null;
  return { sheets, best, guess: best ? guessColumns(best) : null };
}

export function guessColumns(sheet: PlanSheet): PlanColumns {
  const find = (re: RegExp, prefer?: RegExp) => {
    const hits = sheet.headers.filter((h) => re.test(norm(h.title)));
    return (prefer && hits.find((h) => prefer.test(norm(h.title)))) || hits[0];
  };
  const date = find(RE_DATE, /planific/)?.col ?? -1;
  const time = find(RE_TIME, /planific/)?.col ?? null;
  const siglas = find(RE_SIGLAS, /siglas/)?.col ?? -1;
  const place = PLACE_ORDER.map((re) => sheet.headers.find((h) => re.test(norm(h.title)))?.col).filter((c): c is number => c != null);
  return { date, time, siglas, place };
}

/** Fecha de Excel (número de serie o texto dd/mm/aaaa) → AAAA-MM-DD. */
export function toIsoDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Math.floor(Number(v));
    if (n < 20000 || n > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    return iso(y, Number(m[2]) - 1, Number(m[1]));
  }
  const i = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return i ? `${i[1]}-${i[2]}-${i[3]}` : null;
}

/** Hora de Excel (fracción de día o texto) → HH:MM. */
export function toTime(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^\d*(\.\d+)?$/.test(v)) {
    const frac = Number(v) % 1;
    const mins = Math.round(frac * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const m = v.match(/(\d{1,2})[:.h](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v;
}

export interface PlanVisit {
  row: number;
  date: string | null;
  time: string;
  siglas: string[];
  place: string;
}

export function extractVisits(sheet: PlanSheet, cols: PlanColumns): PlanVisit[] {
  const titleOf = (c: number) => norm(sheet.headers.find((h) => h.col === c)?.title ?? '');
  const out: PlanVisit[] = [];
  for (const [row, cells] of sheet.rows) {
    const get = (c: number | null) => (c == null ? '' : (cells.get(c) ?? '').trim());
    const siglasRaw = get(cols.siglas);
    const dateRaw = get(cols.date);
    if (!siglasRaw && !dateRaw) continue; // fila vacía
    // Lugar: «Diamarket 1246 · CL SALVADOR BOTELLA 31, Almussafes (VALENCIA)»
    const byTitle = (re: RegExp) => cols.place.filter((c) => re.test(titleOf(c))).map(get).filter(Boolean);
    const store = [...byTitle(/^tipo de tienda$/), ...byTitle(/^tienda$/)].join(' ');
    const town = byTitle(/localidad|poblacion|municipio/).join(' ');
    const prov = byTitle(/provincia/).join(' ');
    const addr = [byTitle(/direccion/).join(' '), town].filter(Boolean).join(', ') + (prov ? ` (${prov})` : '');
    const known = /^tipo de tienda$|^tienda$|direccion|localidad|poblacion|municipio|provincia/;
    const others = cols.place.filter((c) => !known.test(titleOf(c))).map(get).filter(Boolean);
    out.push({
      row,
      date: toIsoDate(dateRaw),
      time: toTime(get(cols.time)),
      siglas: siglasRaw.split(/[,;/+&]|\s+y\s+|\s+-\s+|\s+/i).map((x) => x.trim()).filter(Boolean),
      place: [store, addr.trim(), ...others].filter(Boolean).join(' · '),
    });
  }
  return out;
}

export interface PlanConflict { emp: Employee; date: string; code: string; visit: string }
export interface PlanItem { emp: Employee; date: string; note: string; setCode: boolean; hadNote: boolean }

export interface PlanResult {
  visits: number;
  codes: CellChange[];
  notes: NoteChange[];
  items: PlanItem[];
  conflicts: PlanConflict[];
  unknownSiglas: Map<string, number>;
  noDate: number[];
  alreadyDone: number;
  people: number;
}

export function planChanges(
  visits: PlanVisit[], motivo: string, employees: Employee[],
  entries: Map<string, Entry>, notes: Map<string, Note>,
): PlanResult {
  const bySiglas = new Map(employees.filter((e) => normSiglas(e.siglas ?? '')).map((e) => [normSiglas(e.siglas), e]));
  const unknownSiglas = new Map<string, number>();
  const noDate: number[] = [];
  // Agrupar por persona y día (puede haber dos visitas el mismo día)
  const grouped = new Map<string, { emp: Employee; date: string; lines: string[] }>();
  for (const v of visits) {
    if (!v.date) { noDate.push(v.row); continue; }
    const line = [motivo.trim(), v.place, v.time].filter(Boolean).join(' · ');
    for (const s of v.siglas) {
      const emp = bySiglas.get(normSiglas(s));
      if (!emp) { unknownSiglas.set(s.toUpperCase(), (unknownSiglas.get(s.toUpperCase()) ?? 0) + 1); continue; }
      const k = `${emp.id}|${v.date}`;
      const g = grouped.get(k) ?? { emp, date: v.date, lines: [] };
      if (!g.lines.includes(line)) g.lines.push(line);
      grouped.set(k, g);
    }
  }

  const codes: CellChange[] = [];
  const noteChanges: NoteChange[] = [];
  const items: PlanItem[] = [];
  const conflicts: PlanConflict[] = [];
  let alreadyDone = 0;
  for (const [k, g] of [...grouped].sort((a, b) => a[1].date.localeCompare(b[1].date) || a[1].emp.nombre.localeCompare(b[1].emp.nombre))) {
    const cur = entries.get(k)?.code;
    if (cur && cur !== PLAN_CODE) {
      conflicts.push({ emp: g.emp, date: g.date, code: cur, visit: g.lines.join(' / ') });
      continue;
    }
    const existing = notes.get(k)?.text ?? '';
    const missing = g.lines.filter((l) => !existing.includes(l));
    const setCode = !cur;
    if (!setCode && !missing.length) { alreadyDone++; continue; }
    if (setCode) codes.push({ employeeId: g.emp.id, date: g.date, code: PLAN_CODE });
    if (missing.length) noteChanges.push({ employeeId: g.emp.id, date: g.date, text: [existing, ...missing].filter(Boolean).join('\n') });
    items.push({ emp: g.emp, date: g.date, note: missing.join('\n'), setCode, hadNote: !!existing });
  }
  const people = new Set([...codes, ...noteChanges].map((c) => c.employeeId)).size;
  return { visits: visits.length, codes, notes: noteChanges, items, conflicts, unknownSiglas, noDate, alreadyDone, people };
}
