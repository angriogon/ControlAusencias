import type { Employee, Entry, Note } from '../types';
import { addDays, daysInMonth, isWeekend, parseIso, iso } from './dates';
import { fold } from './search';

/**
 * Tipos de nota. Se guardan como texto normal con un prefijo («🩺 Médico 09:30 · …»)
 * para que sigan funcionando el historial, la exportación a Excel y las notas
 * antiguas. Las notas sin prefijo se clasifican por palabras clave.
 */
export type NoteType = 'medico' | 'taller' | 'tarea' | 'formacion' | 'otra';

export const NOTE_TYPES: { type: Exclude<NoteType, 'otra'>; emoji: string; label: string }[] = [
  { type: 'medico', emoji: '🩺', label: 'Médico' },
  { type: 'taller', emoji: '🚐', label: 'Taller/ITV' },
  { type: 'tarea', emoji: '📌', label: 'Tarea' },
  { type: 'formacion', emoji: '🎓', label: 'Formación' },
];
export const DONE = '✅';
export const typeInfo = (t: NoteType) => NOTE_TYPES.find((x) => x.type === t) ?? { type: 'otra' as const, emoji: '📝', label: 'Otra' };

const KEYWORDS: [Exclude<NoteType, 'otra'>, RegExp][] = [
  ['medico', /m[eé]dic|cita m|\bconsulta\b|\bhospital\b|anal[ií]tica|reconocimiento|\bmutua\b|fisio|dentista|urgencias/i],
  ['taller', /taller|furgo|\bitv\b|veh[ií]cul|neum[aá]tic|rueda|northgate|revisi[oó]n (del )?coche/i],
  ['formacion', /formaci[oó]n|\bcurso\b/i],
  ['tarea', /recordar|no olvidar|\bllamar\b|\bavisar\b|\benviar\b|\btarea\b/i],
];

const RE_PREFIX = /^(✅\s*)?(🩺|🚐|📌|🎓)\s*(?:Médico|Taller\/ITV|Tarea|Formación)?\s*(\d{1,2}:\d{2})?\s*(?:·\s*)?/u;
const RE_TIME = /\b([01]?\d|2[0-3])\s*(?::|\.|h)\s*([0-5]\d)(?!\d)|\b([01]?\d|2[0-3])\s*h\b/i;

export interface ParsedNote {
  /** null = nota sin tipo explícito (antigua o escrita a mano). */
  type: Exclude<NoteType, 'otra'> | null;
  time: string;
  done: boolean;
  body: string;
}

/** Separa el prefijo de tipo/hora del texto libre. */
export function parseNote(text: string): ParsedNote {
  const m = text.match(RE_PREFIX);
  if (!m || !m[2]) {
    const done = text.startsWith(DONE);
    return { type: null, time: '', done, body: done ? text.slice(DONE.length).trimStart() : text };
  }
  const type = NOTE_TYPES.find((t) => t.emoji === m[2])!.type;
  return { type, time: m[3] ? m[3].padStart(5, '0') : '', done: !!m[1], body: text.slice(m[0].length) };
}

/** Construye el texto a guardar a partir del tipo, la hora y el texto libre. */
export function composeNote(n: ParsedNote): string {
  const t = n.type ? typeInfo(n.type) : null;
  const prefix = [n.done ? DONE : '', t ? `${t.emoji} ${t.label}` : '', t ? n.time : ''].filter(Boolean).join(' ');
  const body = n.body.trim();
  if (!t) return n.done && body ? `${DONE} ${body}` : body;
  return body ? `${prefix} · ${body}` : prefix;
}

export interface NoteInfo { type: NoteType; time: string; done: boolean; explicit: boolean }

/** Tipo y hora de una nota (explícitos o deducidos del texto). */
export function classify(text: string): NoteInfo {
  const p = parseNote(text);
  if (p.type) return { type: p.type, time: p.time || findTime(p.body), done: p.done, explicit: true };
  const hit = KEYWORDS.find(([, re]) => re.test(text));
  return { type: hit ? hit[0] : 'otra', time: findTime(text), done: p.done, explicit: false };
}

export function findTime(text: string): string {
  const m = text.match(RE_TIME);
  if (!m) return '';
  return m[1] ? `${m[1].padStart(2, '0')}:${m[2]}` : `${m[3].padStart(2, '0')}:00`;
}

/** Icono para la celda: ✅ tarea hecha, emoji del tipo o '' (nota normal). */
export function noteIcon(text: string | undefined): string {
  if (!text) return '';
  const c = classify(text);
  if (c.type === 'tarea' && c.done) return DONE;
  return c.type === 'otra' ? '' : typeInfo(c.type).emoji;
}

/** Marca o desmarca una tarea como hecha (conserva el resto del texto). */
export function toggleDone(text: string): string {
  const p = parseNote(text);
  if (p.type) return composeNote({ ...p, done: !p.done });
  return text.startsWith(DONE) ? text.slice(DONE.length).trimStart() : `${DONE} ${text}`;
}

export interface AgendaItem {
  emp: Employee;
  date: string;
  text: string;
  info: NoteInfo;
  code?: string;
  /** Cita (médico/taller) en un día con presencial en cliente. */
  clash: boolean;
}

/** Notas de un rango de fechas convertidas en agenda (ordenadas por día y hora). */
export function agenda(
  employees: Employee[], entries: Map<string, Entry>, notes: Map<string, Note>, from: string, to: string,
): AgendaItem[] {
  const byId = new Map(employees.filter((e) => e.activo).map((e) => [e.id, e]));
  const out: AgendaItem[] = [];
  for (const n of notes.values()) {
    if (n.date < from || n.date > to) continue;
    const emp = byId.get(n.employeeId);
    if (!emp) continue;
    const info = classify(n.text);
    const code = entries.get(`${n.employeeId}|${n.date}`)?.code;
    out.push({ emp, date: n.date, text: n.text, info, code, clash: (info.type === 'medico' || info.type === 'taller') && !!code && /^PC/i.test(code) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.info.time || '99').localeCompare(b.info.time || '99') || a.emp.nombre.localeCompare(b.emp.nombre));
}

/**
 * Tareas sin hacer. Las marcadas como 📌 Tarea siguen apareciendo hasta que se
 * marquen como hechas; las deducidas por palabras clave, solo las de las dos
 * últimas semanas en adelante (para no rescatar notas antiguas).
 */
export function pendingTasks(employees: Employee[], entries: Map<string, Entry>, notes: Map<string, Note>, today: string, until: string): AgendaItem[] {
  const recent = addDays(today, -14);
  return agenda(employees, entries, notes, '0000-01-01', until)
    .filter((a) => a.info.type === 'tarea' && !a.info.done && (a.info.explicit || a.date >= recent));
}

/** Textos de nota más usados (para sugerir), primero los de esa persona. */
export function frequentNotes(notes: Map<string, Note>, employeeId: string | null, limit = 40): string[] {
  const count = new Map<string, { text: string; n: number; mine: number }>();
  for (const n of notes.values()) {
    const first = n.text.split('\n')[0].trim();
    if (!first || first.length > 70) continue;
    // Sin hora («a las 9:30», «10:00h»): así «Médico 9:30» y «Médico 10:00» cuentan como la misma
    const text = composeNote({ ...parseNote(first), time: '', done: false })
      .replace(/\s*(?:a\s+las?\s+)?\b(?:[01]?\d|2[0-3])\s*(?::|\.|h)\s*[0-5]\dh?(?!\d)/gi, '')
      .replace(/\s+/g, ' ').replace(/\s*[·:,-]\s*$/, '').trim();
    const key = fold(text);
    if (key.length < 3) continue;
    const cur = count.get(key) ?? { text, n: 0, mine: 0 };
    cur.n++;
    if (n.employeeId === employeeId) cur.mine++;
    count.set(key, cur);
  }
  return [...count.values()].filter((c) => c.n >= 2 || c.mine > 0)
    .sort((a, b) => b.mine - a.mine || b.n - a.n).slice(0, limit).map((c) => c.text);
}

export type Repeat = 'w' | '2w' | 'm';

/** Fechas de una tarea repetida (sin incluir la primera). Si cae en fin de semana, pasa al lunes. */
export function repeatDates(start: string, every: Repeat, until: string, max = 60): string[] {
  const out: string[] = [];
  const { y, m0, d } = parseIso(start);
  for (let i = 1; out.length < max; i++) {
    let next: string;
    if (every === 'm') {
      const mm = m0 + i;
      const yy = y + Math.floor(mm / 12);
      const m = ((mm % 12) + 12) % 12;
      next = iso(yy, m, Math.min(d, daysInMonth(yy, m)));
      while (isWeekend(next)) next = addDays(next, 1);
    } else {
      next = addDays(start, i * (every === 'w' ? 7 : 14));
    }
    if (next > until) break;
    out.push(next);
  }
  return out;
}
