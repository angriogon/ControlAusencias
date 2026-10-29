import { useCallback, useEffect, useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import type { AppUser, SnapshotInfo } from '../types';
import { formatDate, formatDateTime } from '../lib/dates';
import { parseWorkbook, type ImportResult } from '../lib/excelImport';
import { exportToExcel } from '../lib/excelExport';
import { Modal, useUi, Empty } from '../components/ui';
import { AdminGate, useAdmin } from '../components/admin';

/** Copias de seguridad, exportar a Excel e importar el Excel antiguo. */
export function DataView({ store, data, user }: { store: DataStore; data: AppData; user: AppUser }) {
  const { toast, confirm } = useUi();
  const [snaps, setSnaps] = useState<SnapshotInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const year = new Date().getFullYear();
  const [expFrom, setExpFrom] = useState(`${year}-01-01`);
  const [expTo, setExpTo] = useState(`${year}-12-31`);
  const admin = useAdmin();
  const isAdmin = admin.active;

  const refresh = useCallback(() => store.listSnapshots().then(setSnaps).catch((e) => toast(e.message, 'error')), [store, toast]);
  useEffect(() => { refresh(); }, [refresh]);

  const wrap = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const create = () => wrap('create', async () => {
    await store.createSnapshot(label.trim() || `Copia manual de ${user.name}`);
    setLabel('');
    toast('Copia de seguridad creada');
    await refresh();
  });

  const restore = async (s: SnapshotInfo) => {
    if (!(await admin.requestAdmin('Restaurar una copia completa requiere el modo administrador.'))) return;
    const ok = await confirm({
      title: 'Restaurar copia',
      danger: true,
      ok: 'Sí, restaurar',
      message: <>
        Se sustituirán <b>todos</b> los datos actuales por los de la copia <b>«{s.label}»</b> del {formatDateTime(s.createdAt)} ({s.employees} personas, {s.entries} marcas).
        <br /><br />Antes se guardará automáticamente una copia del estado actual, por si hay que volver atrás.
      </>,
    });
    if (!ok) return;
    await wrap(`restore-${s.id}`, async () => {
      await store.restoreSnapshot(s.id);
      await data.reloadAll();
      toast('Copia restaurada');
      await refresh();
    });
  };

  const downloadSnap = (s: SnapshotInfo) => wrap(`dl-${s.id}`, async () => {
    const d = await store.getSnapshot(s.id);
    const dates = d.entries.map((e) => e.date).sort();
    await exportToExcel(d, dates[0] ?? expFrom, dates[dates.length - 1] ?? expTo, `Copia ${formatDateTime(s.createdAt).replace(/[/: ]/g, '-')}.xlsx`);
  });

  const exportNow = () => wrap('export', async () => {
    if (expFrom > expTo) throw new Error('La fecha "desde" es posterior a "hasta"');
    const years = new Set<number>();
    for (let y = Number(expFrom.slice(0, 4)); y <= Number(expTo.slice(0, 4)); y++) years.add(y);
    await Promise.all([...years].map((y) => data.loadYear(y)));
    await exportToExcel(
      { employees: data.employees, codes: data.codes, entries: [...data.entries.values()], notes: [...data.notes.values()] },
      expFrom, expTo, `Control Ausencias ${formatDate(expFrom).replace(/\//g, '-')} a ${formatDate(expTo).replace(/\//g, '-')}.xlsx`,
    );
  });

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    wrap('parse', async () => {
      const buf = await f.arrayBuffer();
      setPreview(parseWorkbook(buf));
    });
  };

  const doImport = async () => {
    if (!preview) return;
    await wrap('import', async () => {
      await store.importDataset(preview.dataset, `Importa Excel (${preview.stats.employees} personas)`);
      setPreview(null);
      await data.reloadAll();
      toast('Datos importados. Hay una copia automática del estado anterior por si acaso.');
      await refresh();
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Copias de seguridad y Excel</h1>
          <p className="muted">Puntos de restauración del calendario completo. Si alguien borra algo por error, aquí se puede volver atrás.</p>
        </div>
      </div>

      <section className="panel">
        <h2>Crear copia ahora</h2>
        <div className="inline-form">
          <input placeholder="Nombre de la copia (opcional), p. ej. «Antes de cargar festivos 2027»" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="primary" onClick={create} disabled={!!busy || !data.canEdit}>{busy === 'create' ? 'Guardando…' : '💾 Crear copia'}</button>
        </div>
        <p className="muted small">
          {store.mode === 'supabase'
            ? 'Además, el servidor puede hacer una copia automática cada noche (ver guía de instalación) y siempre guarda una antes de restaurar o importar.'
            : 'Modo local: las copias se guardan en este navegador. Se guarda una automática antes de restaurar o importar.'}
        </p>
      </section>

      <section className="panel">
        <h2>Copias guardadas</h2>
        {!snaps.length ? <Empty>Aún no hay copias.</Empty> : (
          <table className="table">
            <thead><tr><th>Fecha</th><th>Nombre</th><th>Creada por</th><th>Contenido</th><th /></tr></thead>
            <tbody>
              {snaps.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{formatDateTime(s.createdAt)}</td>
                  <td>{s.label} {s.auto && <span className="tag gray">automática</span>}</td>
                  <td>{s.createdBy}</td>
                  <td className="nowrap">{s.employees} personas · {s.entries} marcas</td>
                  <td className="nowrap right">
                    <button onClick={() => downloadSnap(s)} disabled={!!busy}>⬇ Excel</button>{' '}
                    <button className="danger-ghost" onClick={() => restore(s)} disabled={!!busy || !data.canEdit}>{isAdmin ? '' : '🔒 '}↺ Restaurar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isAdmin && <p className="muted small">Restaurar una copia completa requiere el modo administrador. Para deshacer cambios concretos usa el Historial.</p>}
      </section>

      <section className="panel">
        <h2>Exportar a Excel</h2>
        <div className="inline-form">
          <label>Desde <input type="date" value={expFrom} onChange={(e) => setExpFrom(e.target.value)} /></label>
          <label>Hasta <input type="date" value={expTo} onChange={(e) => setExpTo(e.target.value)} /></label>
          <button onClick={exportNow} disabled={!!busy}>{busy === 'export' ? 'Generando…' : '⬇ Descargar Excel'}</button>
        </div>
        <p className="muted small">Mismo formato que la hoja de siempre (con colores), más una hoja de resumen y la leyenda.</p>
      </section>

      {(
        <section className="panel">
          <h2>Importar el Excel antiguo</h2>
          <p className="muted small">
            Carga el archivo «Control Ausencias» (.xlsx o .xlsm). Se lee en tu ordenador; verás un resumen antes de confirmar.
            <b> Sustituye todos los datos actuales</b> (se guarda una copia automática antes).
          </p>
          <AdminGate what="Importar">
            <input type="file" accept=".xlsx,.xlsm" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} disabled={!!busy || !data.canEdit} />
            {busy === 'parse' && <p>Leyendo el archivo…</p>}
          </AdminGate>
        </section>
      )}

      {preview && (
        <Modal title="Revisar importación" wide onClose={() => setPreview(null)} footer={<>
          <button onClick={() => setPreview(null)}>Cancelar</button>
          <button className="primary" onClick={doImport} disabled={busy === 'import'}>{busy === 'import' ? 'Importando…' : 'Importar y sustituir'}</button>
        </>}>
          <div className="stats">
            <div className="stat"><b>{preview.stats.employees}</b><span>personas</span></div>
            <div className="stat"><b>{preview.stats.entries}</b><span>marcas</span></div>
            <div className="stat"><b>{preview.stats.notes}</b><span>notas</span></div>
            <div className="stat"><b>{preview.stats.from ? formatDate(preview.stats.from) : '-'}</b><span>desde</span></div>
            <div className="stat"><b>{preview.stats.to ? formatDate(preview.stats.to) : '-'}</b><span>hasta</span></div>
          </div>
          <p className="muted small">Hoja leída: «{preview.stats.sheet}»</p>
          {preview.warnings.length > 0 && (
            <div className="warn-box">
              <b>Avisos</b>
              <ul>{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <h3>Primeras personas</h3>
          <table className="table small">
            <thead><tr><th>Nombre</th><th>Equipo</th><th>Zona</th><th>Sede</th><th>Vac. año</th><th>Marcas</th><th>Notas</th></tr></thead>
            <tbody>
              {preview.dataset.employees.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td>{e.nombre}</td><td>{e.equipo}</td><td>{e.zona}</td><td>{e.sede}</td><td>{e.diasVacaciones}</td>
                  <td>{preview.dataset.entries.filter((x) => x.employeeId === e.id).length}</td>
                  <td>{(preview.dataset.notes ?? []).filter((x) => x.employeeId === e.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
