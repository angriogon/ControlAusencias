import { unzipSync, strFromU8 } from 'fflate';
import type { Code, Dataset, Employee, Entry, Note } from '../types';
import { DEFAULT_CODES, normalizeCode } from './codes';
import { fillSiglas } from './siglas';
import { MONTHS_SHORT, WEEKDAY_LETTER, iso, weekday, daysInMonth } from './dates';

/**
 * Lector del Excel "Control Ausencias" (.xlsx / .xlsm).
 *
 * No usa una librería de Excel completa a propósito: el archivo original pesa
 * mucho (miles de reglas de formato condicional) y aquí solo necesitamos los
 * valores. Se descomprime y se leen las celdas directamente del XML.
 *
 * Se apoya en los TEXTOS de cabecera ("Nombre", "Zona"...) y no en letras de
 * columna fijas, para que siga funcionando aunque alguien haya movido columnas.
 */

interface Cell { v: string; f?: string }
type Grid = Map<number, Map<number, Cell>>;
interface Comment { text: string; author: string }
type Comments = Map<number, Map<number, Comment>>;

export interface ImportResult {
  dataset: Dataset;
  warnings: string[];
  stats: {
    employees: number;
    entries: number;
    from: string | null;
    to: string | null;
    sheet: string;
    unknownCodes: Record<string, number>;
    normalized: number;
    notes: number;
  };
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Notas de Excel (las "notas" amarillas y también los comentarios modernos,
 * que Excel guarda además en este mismo formato). Casi todas empiezan por
 * "NOMBRE DEL AUTOR:\n": ese nombre se usa como autor y se quita del texto.
 */
function readComments(files: Record<string, Uint8Array>, sheetPath: string): Comments {
  const out: Comments = new Map();
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const rels = files[relsPath] ? strFromU8(files[relsPath]) : '';
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => /Type="[^"]*\/comments"/.test(r));
  const target = rel?.match(/Target="([^"]+)"/)?.[1];
  if (!target) return out;
  const base = sheetPath.replace(/[^/]+$/, '');
  const path = target.startsWith('/') ? target.slice(1) : new URL(target, `http://x/${base}`).pathname.slice(1);
  const xml = files[path] ? strFromU8(files[path]) : '';
  const authors = [...(xml.match(/<authors>([\s\S]*?)<\/authors>/)?.[1] ?? '').matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) => decode(m[1]));
  for (const m of xml.matchAll(/<comment\b[^>]*ref="([A-Z]+)(\d+)"[^>]*?(?:authorId="(\d+)")?[^>]*>([\s\S]*?)<\/comment>/g)) {
    let text = textOf(m[4]).replace(/\r\n?/g, '\n');
    let author = authors[Number(m[3] ?? -1)] ?? '';
    const pre = text.match(/^([^:\n]{2,60}):[ \t]*\n/);
    if (pre) { author = pre[1].trim(); text = text.slice(pre[0].length); }
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) continue;
    const row = Number(m[2]);
    if (!out.has(row)) out.set(row, new Map());
    out.get(row)!.set(colIndex(m[1]), { text, author });
  }
  return out;
}

function readSheet(files: Record<string, Uint8Array>, wanted: RegExp): { name: string; grid: Grid; comments: Comments } {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const sheets = [...wb.matchAll(/<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)].map((m) => ({ name: decode(m[1]), rid: m[2] }));
  if (!sheets.length) throw new Error('El archivo no tiene hojas reconocibles.');
  const sheet = sheets.find((s) => wanted.test(s.name)) ?? sheets[0];
  const relRe = new RegExp(`<Relationship\\b[^>]*Id="${sheet.rid}"[^>]*>`);
  const rel = rels.match(relRe)?.[0] ?? '';
  let target = rel.match(/Target="([^"]+)"/)?.[1] ?? 'worksheets/sheet1.xml';
  target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;

  const shared: string[] = [];
  const ssFile = files['xl/sharedStrings.xml'];
  if (ssFile) {
    for (const m of strFromU8(ssFile).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }

  const xml = strFromU8(files[target]);
  const grid: Grid = new Map();
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of xml.matchAll(cellRe)) {
    const body = m[4];
    if (!body) continue;
    const row = Number(m[2]);
    if (row > 2000) continue;
    const col = colIndex(m[1]);
    const type = m[3].match(/t="([^"]+)"/)?.[1];
    const f = body.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];
    let v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (type === 's' && v != null) v = shared[Number(v)] ?? '';
    else if (type === 'inlineStr') v = textOf(body);
    else if (v != null) v = decode(v);
    if (v == null && f == null) continue;
    if (!grid.has(row)) grid.set(row, new Map());
    grid.get(row)!.set(col, { v: v ?? '', f: f ? decode(f) : undefined });
  }
  return { name: sheet.name, grid, comments: readComments(files, target) };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s: string | undefined) => (s ?? '').replace(/ /g, ' ').replace(/\s*\n\s*/g, ' ').trim();

/** Cabeceras conocidas → campo de la ficha. */
const HEADERS: [RegExp, keyof Employee][] = [
  [/^telefono/, 'telefono'],
  [/^almacen/, 'almacen'],
  [/^team leader/, 'teamLeader'],
  [/^extension/, 'extension'],
  [/^equipo/, 'equipo'],
  [/^zona/, 'zona'],
  [/^guardia/, 'guardias'],
  [/^sede/, 'sede'],
  [/^nombre/, 'nombre'],
  [/^vp\b/, 'vpPendientes'],
  [/^v \d{4}/, 'diasVacaciones'],
  [/^dias lh/, 'diasLh'],
];

export function parseWorkbook(buffer: ArrayBuffer | Uint8Array): ImportResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith('xl/') && !f.name.includes('media/') && !f.name.endsWith('.bin') });
  } catch {
    throw new Error('No parece un archivo Excel válido (.xlsx o .xlsm). Si es .xls antiguo, guárdalo antes como .xlsx.');
  }
  const { name: sheetName, grid, comments } = readSheet(files, /ausencia/i);
  const warnings: string[] = [];
  const get = (r: number, c: number) => clean(grid.get(r)?.get(c)?.v);

  // 1) Fila de cabeceras: la que contiene "Nombre"
  let headerRow = -1;
  const colOf = new Map<keyof Employee, number>();
  for (const [r, cells] of [...grid.entries()].sort((a, b) => a[0] - b[0])) {
    if ([...cells.values()].some((c) => norm(c.v) === 'nombre')) { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error('No encuentro la fila de cabeceras (una celda que diga "Nombre").');
  for (const [c, cell] of grid.get(headerRow)!) {
    const h = norm(cell.v);
    const hit = HEADERS.find(([re]) => re.test(h));
    if (hit && !colOf.has(hit[1])) colOf.set(hit[1], c);
  }
  const nameCol = colOf.get('nombre')!;
  const lastInfoCol = Math.max(...colOf.values());

  // 2) Filas auxiliares del calendario: letras de día y meses
  const above = [...grid.keys()].filter((r) => r < headerRow);
  const countIn = (r: number, test: (s: string) => boolean) =>
    [...(grid.get(r)?.values() ?? [])].filter((c) => test(clean(c.v))).length;
  const wkRow = above.sort((a, b) => countIn(b, (s) => WEEKDAY_LETTER.includes(s)) - countIn(a, (s) => WEEKDAY_LETTER.includes(s)))[0];
  const monthIdx = (s: string) => MONTHS_SHORT.findIndex((m) => norm(m) === norm(s).slice(0, 3));
  const monthRow = above.sort((a, b) => countIn(b, (s) => monthIdx(s) >= 0) - countIn(a, (s) => monthIdx(s) >= 0))[0];

  // 3) Columnas de días: número 1..31 en la cabecera y letra de día encima
  const dayCols = [...grid.get(headerRow)!.entries()]
    .filter(([c, cell]) => c > lastInfoCol && /^\d{1,2}$/.test(clean(cell.v)) && Number(cell.v) >= 1 && Number(cell.v) <= 31
      && WEEKDAY_LETTER.includes(get(wkRow, c)))
    .map(([c]) => c)
    .sort((a, b) => a - b);

  const anchor = dayCols.find((c) => monthIdx(get(monthRow, c)) >= 0);
  if (anchor == null) throw new Error('No encuentro el calendario (fila con los meses "Ene", "Feb"...).');
  let month = monthIdx(get(monthRow, anchor));
  let year = NaN;
  for (let c = anchor; c <= anchor + 6 && Number.isNaN(year); c++) {
    const n = Number(get(monthRow, c));
    if (n >= 2000 && n <= 2100) year = n;
  }
  if (Number.isNaN(year)) throw new Error('No encuentro el año del calendario junto al primer mes.');

  // Se usa la letra del día (L, M, X...) para decidir la fecha de cada columna.
  // Así se detectan bloques copiados por error (p. ej. una semana repetida),
  // que en el Excel original existen y descuadran el calendario.
  const colDate = new Map<number, string>();
  let prevDay = 0;
  let mismatches = 0;
  for (const c of dayCols.filter((c) => c >= anchor)) {
    const day = Number(get(headerRow, c));
    const letter = get(wkRow, c);
    const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
    const here = { y: year, m: month };
    const order = day < prevDay ? [next, here] : [here, next];
    const valid = order.filter((o) => day <= daysInMonth(o.y, o.m));
    const pick = valid.find((o) => WEEKDAY_LETTER[weekday(iso(o.y, o.m, day))] === letter);
    if (!pick) mismatches++;
    const chosen = pick ?? valid[0];
    if (!chosen) { mismatches++; continue; }
    year = chosen.y;
    month = chosen.m;
    prevDay = day;
    colDate.set(c, iso(year, month, day));
  }
  if (mismatches) warnings.push(`${mismatches} columna(s) del calendario no cuadran con el día de la semana; revisa esas fechas.`);
  const skipped = dayCols.filter((c) => c < anchor).length;
  if (skipped) warnings.push(`${skipped} columna(s) antes del primer mes se han ignorado (no tienen mes/año claro).`);

  // 4) Personas
  const codes: Code[] = DEFAULT_CODES.map((c) => ({ ...c }));
  const unknown: Record<string, number> = {};
  let normalized = 0;
  const employees: Employee[] = [];
  const entryMap = new Map<string, Entry>();
  const noteMap = new Map<string, Note>();
  const usedCommentRows = new Set<number>();
  let notesInInfo = 0;
  let mergedNotes = 0;
  let duplicateConflicts = 0;
  const seenDates = new Map<string, number>();
  for (const [, d] of colDate) seenDates.set(d, (seenDates.get(d) ?? 0) + 1);
  const dupDates = [...seenDates.entries()].filter(([, n]) => n > 1).map(([d]) => d).sort();
  const rows = [...grid.keys()].filter((r) => r > headerRow).sort((a, b) => a - b);
  for (const r of rows) {
    const nombre = get(r, nameCol);
    const rowText = [...(grid.get(r)?.values() ?? [])].slice(0, 12).map((c) => norm(c.v)).join(' ');
    if (/total|claves de/.test(rowText) && !nombre) break;
    if (/^n. total|total tecnicos|total ausencias/.test(rowText)) break;
    if (!nombre) continue;
    const field = (k: keyof Employee) => (colOf.has(k) ? get(r, colOf.get(k)!) : '');
    const num = (k: keyof Employee, def: number) => {
      const n = Number(field(k).replace(',', '.'));
      return Number.isFinite(n) && field(k) !== '' ? n : def;
    };
    // "V 2026" suele ser una fórmula "=25-PV12": el 25 son los días del año.
    let diasVacaciones = 25;
    const vCol = colOf.get('diasVacaciones');
    const vf = vCol ? grid.get(r)?.get(vCol)?.f : undefined;
    const fm = vf?.match(/^\+?\s*(\d+(?:[.,]\d+)?)\s*-/);
    if (fm) diasVacaciones = Number(fm[1].replace(',', '.'));

    const emp: Employee = {
      id: crypto.randomUUID(),
      nombre,
      siglas: '',
      telefono: field('telefono'),
      extension: field('extension'),
      almacen: field('almacen'),
      teamLeader: field('teamLeader'),
      equipo: field('equipo'),
      zona: field('zona'),
      guardias: field('guardias'),
      sede: field('sede'),
      diasVacaciones,
      vpPendientes: num('vpPendientes', 0),
      diasLh: num('diasLh', 0),
      notas: '',
      orden: employees.length,
      activo: true,
    };
    employees.push(emp);

    // Notas de esta fila: las de días van a la celda; el resto, a la ficha.
    for (const [c, cm] of comments.get(r) ?? []) {
      const date = colDate.get(c);
      if (!date) {
        emp.notas = [emp.notas, `Nota del Excel: ${cm.text}${cm.author ? ` (${cm.author})` : ''}`].filter(Boolean).join('\n');
        notesInInfo++;
        continue;
      }
      const key = `${emp.id}|${date}`;
      const prev = noteMap.get(key);
      if (prev && prev.text !== cm.text) {
        // Fecha duplicada en el Excel con notas distintas: se conservan las dos
        prev.text = `${prev.text}\n— ${cm.text}`;
        mergedNotes++;
      } else if (!prev) {
        noteMap.set(key, { employeeId: emp.id, date, text: cm.text, author: cm.author });
      }
    }
    usedCommentRows.add(r);

    for (const [c, date] of colDate) {
      const raw = get(r, c);
      if (!raw) continue;
      let code = normalizeCode(raw, codes);
      if (code && code !== raw) normalized++;
      if (!code) {
        const key = raw.trim();
        unknown[key] = (unknown[key] ?? 0) + 1;
        codes.push({
          code: key, label: `${key} (importada, revisar)`, color: '#BFBFBF', textColor: '#000000',
          category: 'control', orden: codes.length, activo: true,
        });
        code = key;
      }
      // Si una fecha aparece en dos columnas (bloque duplicado), gana la columna de más a la derecha.
      const key = `${emp.id}|${date}`;
      const prev = entryMap.get(key);
      if (prev && prev.code !== code) duplicateConflicts++;
      entryMap.set(key, { employeeId: emp.id, date, code });
    }
  }
  const entries = [...entryMap.values()];
  const notes = [...noteMap.values()];
  const lostNotes = [...comments.entries()].filter(([row]) => !usedCommentRows.has(row)).reduce((n, [, m]) => n + m.size, 0);
  if (notesInInfo) warnings.push(`${notesInInfo} nota(s) no estaban en un día concreto: se han añadido a las notas de la ficha de cada persona.`);
  if (mergedNotes) warnings.push(`${mergedNotes} nota(s) estaban en días repetidos con texto distinto: se han unido en una sola nota.`);
  if (lostNotes) warnings.push(`${lostNotes} nota(s) están fuera de las filas de personas (cabeceras o leyenda) y no se importan.`);
  if (dupDates.length) {
    warnings.push(`El Excel tiene fechas repetidas en varias columnas (${dupDates.length} días, del ${dupDates[0]} al ${dupDates[dupDates.length - 1]}). Se han unificado${duplicateConflicts ? `; en ${duplicateConflicts} caso(s) había valores distintos y se ha quedado el de la columna más a la derecha` : ''}.`);
  }
  if (!employees.length) throw new Error('No he encontrado personas debajo de la cabecera "Nombre".');
  if (Object.keys(unknown).length) {
    warnings.push(`Claves desconocidas añadidas en gris para que las revises: ${Object.entries(unknown).map(([k, n]) => `"${k}" (${n})`).join(', ')}.`);
  }
  if (normalized) warnings.push(`${normalized} marca(s) escritas en minúsculas/otro formato se han corregido (p. ej. "pc" → "PC").`);

  const dates = [...colDate.values()].sort();
  return {
    // Siglas propuestas a partir del nombre (el Excel no las tiene): se revisan en Ajustes
    dataset: { employees: fillSiglas(employees), codes, entries, notes },
    warnings,
    stats: {
      employees: employees.length,
      entries: entries.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      sheet: sheetName,
      unknownCodes: unknown,
      normalized,
      notes: notes.length,
    },
  };
}
