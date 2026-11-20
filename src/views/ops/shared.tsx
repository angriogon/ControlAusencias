import { useMemo } from 'react';
import type { AppData } from '../../data/useAppData';
import { addDays, isWeekend } from '../../lib/dates';
import { codeMap } from '../../lib/codes';
import { absenceSet, fieldStaff, zonesOf, type Level } from '../../lib/ops';
import { classify, typeInfo } from '../../lib/notes';

export const LEVEL_LABEL: Record<Level, string> = { ok: 'Cubierta', justo: 'Justa', bajo: 'Sin cubrir', festivo: 'Festivo' };

/** Redondeo a un decimal para mostrar (las medias jornadas cuentan 0,5). */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/** Siguiente día laborable (L–V) a partir de una fecha (incluida si ya lo es). */
export const nextWorkday = (d: string) => { let x = d; while (isWeekend(x)) x = addDays(x, 1); return x; };

/** Datos comunes: técnicos de campo, zonas, claves de ausencia. */
export function useOpsBase(data: AppData) {
  const staff = useMemo(() => fieldStaff(data.employees, data.ops), [data.employees, data.ops]);
  const zones = useMemo(() => zonesOf(staff), [staff]);
  const absence = useMemo(() => absenceSet(data.codes), [data.codes]);
  const codeBy = useMemo(() => codeMap(data.codes), [data.codes]);
  return { staff, zones, absence, codeBy };
}

export function Chip({ code, data }: { code: string; data: AppData }) {
  const c = data.codes.find((x) => x.code === code);
  return <span className="chip small" style={{ background: c?.color ?? '#ddd', color: c?.textColor ?? '#000' }} title={c?.label}>{code}</span>;
}

export function Dot({ level }: { level: Level }) {
  return <span className={`dot ${level}`} title={LEVEL_LABEL[level]} />;
}

/** Cita (médico/taller/formación) de ese día junto al nombre. */
export function NoteBadge({ text }: { text?: string }) {
  if (!text) return null;
  const c = classify(text);
  if (c.type === 'otra' || c.type === 'tarea') return null;
  return <span className="tag warn-tag" title={text}>{typeInfo(c.type).emoji} {typeInfo(c.type).label}{c.time && ` ${c.time}`}</span>;
}
