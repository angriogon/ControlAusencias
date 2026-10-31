import { useMemo, useState } from 'react';
import type { AppData } from '../data/useAppData';
import { addDays, isWeekend, todayIso } from '../lib/dates';
import { agenda, pendingTasks, typeInfo, type AgendaItem, type NoteType } from '../lib/notes';

const KEY = 'ca-strip-hidden';
const nextWorkday = (d: string) => { let x = addDays(d, 1); while (isWeekend(x)) x = addDays(x, 1); return x; };

function summary(items: AgendaItem[]): string {
  const n = new Map<NoteType, number>();
  for (const a of items) if (a.info.type !== 'otra' && !(a.info.type === 'tarea' && a.info.done)) n.set(a.info.type, (n.get(a.info.type) ?? 0) + 1);
  return (['medico', 'taller', 'formacion', 'tarea'] as NoteType[]).filter((t) => n.get(t))
    .map((t) => `${typeInfo(t).emoji} ${n.get(t)} ${t === 'medico' ? 'médico' : t === 'taller' ? 'taller/ITV' : t === 'formacion' ? 'formación' : 'tarea'}${n.get(t)! > 1 && t === 'tarea' ? 's' : ''}`)
    .join(' · ');
}

/** Franja con lo de hoy y del siguiente laborable. Solo aparece si hay algo; se puede ocultar hasta mañana. */
export function TodayStrip({ data, onOpen }: { data: AppData; onOpen: () => void }) {
  const today = todayIso();
  const next = nextWorkday(today);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === today; } catch { return false; } });
  const info = useMemo(() => {
    const all = agenda(data.employees, data.entries, data.notes, today, next);
    const pending = pendingTasks(data.employees, data.entries, data.notes, today, today).filter((a) => a.date < today).length;
    return { hoy: summary(all.filter((a) => a.date === today)), next: summary(all.filter((a) => a.date === next)), pending };
  }, [data.employees, data.entries, data.notes, today, next]);
  if (hidden || (!info.hoy && !info.next && !info.pending)) return null;
  const hide = () => { try { localStorage.setItem(KEY, today); } catch { /* */ } setHidden(true); };
  return (
    <div className="today-strip">
      <button className="strip-main" onClick={onOpen} title="Abrir la agenda">
        {info.hoy && <span><b>Hoy:</b> {info.hoy}</span>}
        {info.next && <span><b>{isWeekend(today) || next !== addDays(today, 1) ? 'Próximo laborable' : 'Mañana'}:</b> {info.next}</span>}
        {info.pending > 0 && <span className="strip-bad">📌 {info.pending} tarea{info.pending > 1 ? 's' : ''} atrasada{info.pending > 1 ? 's' : ''}</span>}
        <span className="strip-link">Ver agenda →</span>
      </button>
      <button className="icon-btn strip-close" onClick={hide} aria-label="Ocultar hasta mañana" title="Ocultar hasta mañana">✕</button>
    </div>
  );
}
