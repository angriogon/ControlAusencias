export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
/** Letra de día igual que en el Excel (0 = domingo). */
export const WEEKDAY_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const WEEKDAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Fechas siempre como texto YYYY-MM-DD para evitar líos de zona horaria. */
export function iso(y: number, m0: number, d: number): string {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

export function parseIso(s: string): { y: number; m0: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m0: m - 1, d };
}

export function todayIso(): string {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

export function weekday(s: string): number {
  const { y, m0, d } = parseIso(s);
  return new Date(Date.UTC(y, m0, d)).getUTCDay();
}

export function isWeekend(s: string): boolean {
  const w = weekday(s);
  return w === 0 || w === 6;
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

export function monthDays(y: number, m0: number): string[] {
  return Array.from({ length: daysInMonth(y, m0) }, (_, i) => iso(y, m0, i + 1));
}

export function addDays(s: string, n: number): string {
  const { y, m0, d } = parseIso(s);
  const t = new Date(Date.UTC(y, m0, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** Lista de días entre dos fechas (ambas incluidas, en cualquier orden). */
export function dateRange(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Número de semana ISO (lunes como primer día), útil para la cabecera. */
export function isoWeek(s: string): number {
  const { y, m0, d } = parseIso(s);
  const t = new Date(Date.UTC(y, m0, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatDate(s: string): string {
  const { y, m0, d } = parseIso(s);
  return `${pad(d)}/${pad(m0 + 1)}/${y}`;
}

export function formatDateLong(s: string): string {
  const { m0, d } = parseIso(s);
  return `${WEEKDAY_NAME[weekday(s)]} ${d} de ${MONTHS[m0].toLowerCase()}`;
}

export function formatDateTime(ts: string): string {
  const t = new Date(ts);
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export function relativeTime(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return formatDateTime(ts);
}
