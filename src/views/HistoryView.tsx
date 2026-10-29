import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import { ConflictError, type ChangeLog, type Code, type Employee } from '../types';
import { formatDate, formatDateTime, relativeTime } from '../lib/dates';
import { useUi, Empty } from '../components/ui';

interface Batch { id: string; items: ChangeLog[] }

const FIELD_LABEL: Partial<Record<keyof Employee, string>> = {
  nombre: 'nombre', telefono: 'teléfono', extension: 'extensión', almacen: 'almacén', teamLeader: 'team leader',
  equipo: 'equipo', zona: 'zona', guardias: 'guardias', sede: 'sede', diasVacaciones: 'días de vacaciones',
  vpPendientes: 'VP pendientes', diasLh: 'días LH', notas: 'notas', orden: 'orden', activo: 'activo',
};

export function HistoryView({ store, data }: { store: DataStore; data: AppData }) {
  const { toast, confirm } = useUi();
  const [items, setItems] = useState<ChangeLog[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [user, setUser] = useState('');
  const [emp, setEmp] = useState('');
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const PAGE = 300;

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const before = reset ? undefined : items[items.length - 1]?.id;
      const page = await store.listChanges({ limit: PAGE, beforeId: before, userName: user || undefined, employeeId: emp || undefined });
      setItems((prev) => (reset ? page : [...prev, ...page]));
      setMore(page.length === PAGE);
    } catch (e) {
      toast(`No se pudo cargar el historial: ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [store, user, emp, items, toast]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [user, emp]);
  useEffect(() => { store.listUsers().then(setUsers).catch(() => {}); }, [store]);

  const names = useMemo(() => new Map(data.employees.map((e) => [e.id, e.nombre])), [data.employees]);
  const codes = useMemo(() => new Map(data.codes.map((c) => [c.code, c])), [data.codes]);
  const nameOf = (c: ChangeLog) => names.get(c.employeeId ?? '')
    ?? ((c.oldValue ?? c.newValue) as Employee | null)?.nombre ?? '(persona eliminada)';

  const batches = useMemo(() => {
    const out: Batch[] = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (last && it.batchId && last.id === it.batchId) last.items.push(it);
      else out.push({ id: it.batchId ?? `single-${it.id}`, items: [it] });
    }
    return out;
  }, [items]);

  const revert = async (b: Batch, one?: ChangeLog) => {
    const run = async (force: boolean) => {
      if (one) await store.revertChange(one.id, force);
      else if (b.items[0].batchId) await store.revertBatch(b.items[0].batchId, force);
      else await store.revertChange(b.items[0].id, force);
    };
    const what = one ? 'este cambio' : b.items.length > 1 ? `estos ${b.items.length} cambios` : 'este cambio';
    if (!(await confirm({ title: 'Deshacer', message: <>¿Seguro que quieres deshacer {what}? Se volverá al valor anterior y quedará anotado en el historial.</>, ok: 'Deshacer' }))) return;
    try {
      await run(false);
    } catch (e) {
      if (e instanceof ConflictError) {
        const ok = await confirm({
          title: 'Hay cambios posteriores',
          message: <>{e.message}<br /><br />Si sigues, se pisarán esos cambios más recientes con el valor antiguo.</>,
          ok: 'Deshacer igualmente', danger: true,
        });
        if (!ok) return;
        try { await run(true); } catch (e2) { toast((e2 as Error).message, 'error'); return; }
      } else { toast((e as Error).message, 'error'); return; }
    }
    toast('Cambio deshecho');
    await data.reloadAll();
    await load(true);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Historial de cambios</h1>
          <p className="muted">Todo lo que se modifica queda anotado: quién, cuándo y qué había antes. Desde aquí se puede deshacer.</p>
        </div>
        <div className="filters">
          <select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Usuario">
            <option value="">Todas las personas que editan</option>
            {users.map((u) => <option key={u}>{u}</option>)}
          </select>
          <select value={emp} onChange={(e) => setEmp(e.target.value)} aria-label="Persona afectada">
            <option value="">Cualquier persona del calendario</option>
            {data.employees.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <button onClick={() => load(true)} disabled={loading}>↻ Actualizar</button>
        </div>
      </div>

      {!batches.length && !loading && <Empty>Todavía no hay cambios registrados.</Empty>}

      <div className="history">
        {batches.map((b) => {
          const head = b.items[0];
          const reverted = b.items.every((x) => x.revertedBy != null || x.entity === 'system');
          const isOpen = open.has(b.id) || b.items.length === 1;
          return (
            <div key={b.id} className={`hist-item ${reverted && head.entity !== 'system' ? 'reverted' : ''}`}>
              <div className="hist-main">
                <div className="hist-when" title={formatDateTime(head.ts)}>
                  <b>{relativeTime(head.ts)}</b>
                  <span>{formatDateTime(head.ts)}</span>
                </div>
                <div className="hist-what">
                  <div><span className="avatar">{initials(head.userName)}</span> <b>{head.userName}</b> · {head.batchLabel ?? describeAction(head)}</div>
                  {b.items.length > 1 && (
                    <button className="link" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}>
                      {isOpen ? 'Ocultar detalle' : `Ver ${b.items.length} cambios`}
                    </button>
                  )}
                  {head.revertOf != null && <span className="tag">deshace el cambio #{head.revertOf}</span>}
                  {reverted && head.entity !== 'system' && <span className="tag gray">deshecho</span>}
                </div>
                <div className="hist-actions">
                  {!reverted && head.entity !== 'system' && data.canEdit && (
                    <button onClick={() => revert(b)}>↶ Deshacer{b.items.length > 1 ? ' todo' : ''}</button>
                  )}
                </div>
              </div>
              {isOpen && (
                <ul className="hist-detail">
                  {b.items.slice(0, 200).map((c) => (
                    <li key={c.id} className={c.revertedBy != null ? 'reverted' : ''}>
                      <ChangeText c={c} name={nameOf(c)} codes={codes} />
                      {b.items.length > 1 && c.revertedBy == null && c.entity !== 'system' && data.canEdit && (
                        <button className="link small" onClick={() => revert(b, c)}>deshacer solo este</button>
                      )}
                    </li>
                  ))}
                  {b.items.length > 200 && <li className="muted">… y {b.items.length - 200} más</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {more && batches.length > 0 && (
        <div className="center"><button onClick={() => load(false)} disabled={loading}>{loading ? 'Cargando…' : 'Cargar más antiguos'}</button></div>
      )}
    </div>
  );
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');

function describeAction(c: ChangeLog) {
  if (c.entity === 'system') return c.action === 'restore' ? 'Restauró una copia' : 'Importó datos';
  return { insert: 'Añadió', update: 'Modificó', delete: 'Borró', restore: 'Restauró', import: 'Importó' }[c.action];
}

function Val({ code, codes }: { code: unknown; codes: Map<string, Code> }) {
  if (code == null || code === '') return <span className="muted">(vacío)</span>;
  const c = codes.get(String(code));
  return <span className="chip small" style={{ background: c?.color ?? '#ddd', color: c?.textColor ?? '#000' }}>{String(code)}</span>;
}

function ChangeText({ c, name, codes }: { c: ChangeLog; name: string; codes: Map<string, Code> }) {
  if (c.entity === 'entry') {
    return <span><b>{name}</b> · {c.date ? formatDate(c.date) : ''}: <Val code={c.oldValue} codes={codes} /> → <Val code={c.newValue} codes={codes} /></span>;
  }
  if (c.entity === 'employee') {
    const o = c.oldValue as Employee | null;
    const n = c.newValue as Employee | null;
    if (!o) return <span>Alta de <b>{n?.nombre}</b></span>;
    if (!n) return <span>Eliminada la ficha de <b>{o.nombre}</b></span>;
    const diffs = (Object.keys(FIELD_LABEL) as (keyof Employee)[]).filter((k) => String(o[k]) !== String(n[k]));
    return (
      <span>Ficha de <b>{n.nombre}</b>: {diffs.map((k, i) => (
        <span key={k}>{i ? '; ' : ''}{FIELD_LABEL[k]} «{fmt(o[k])}» → «{fmt(n[k])}»</span>
      ))}</span>
    );
  }
  if (c.entity === 'code') {
    const o = c.oldValue as Code | null;
    const n = c.newValue as Code | null;
    return <span>Clave <b>{(n ?? o)?.code}</b>: {o ? (n ? 'modificada' : 'eliminada') : 'creada'}{n ? ` («${n.label}»)` : ''}</span>;
  }
  const v = c.newValue as { employees?: number; entries?: number } | null;
  return <span>{c.batchLabel} {v ? `(${v.employees} personas, ${v.entries} marcas)` : ''}</span>;
}

const fmt = (v: unknown) => (typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v ?? ''));
