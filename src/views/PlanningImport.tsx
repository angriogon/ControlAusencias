import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../data/useAppData';
import { MASS_PEOPLE_LIMIT } from '../types';
import { formatDate } from '../lib/dates';
import { PLAN_CODE, conflictKey, extractVisits, guessColumns, planChanges, readPlanning, withSubstitutes, type PlanColumns, type PlanSheet } from '../lib/planningImport';
import { absenceSet, candidates, fieldStaff } from '../lib/ops';
import type { Employee } from '../types';
import { Modal, useUi } from '../components/ui';
import { useAdmin } from '../components/admin';

/**
 * Importar una planificación (Excel): marca PC y pone en la nota el motivo,
 * el lugar y la hora. No toca los días que ya tienen otra clave (los avisa).
 */
export function PlanningImport({ data, onClose }: { data: AppData; onClose: () => void }) {
  const { toast } = useUi();
  const admin = useAdmin();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<PlanSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [cols, setCols] = useState<PlanColumns | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [yearsReady, setYearsReady] = useState(false);
  /** Sustituto elegido para cada día en conflicto (clave persona|fecha). */
  const [subs, setSubs] = useState<Map<string, Employee>>(new Map());

  const sheet = sheets[sheetIdx];

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const { sheets: found, best } = readPlanning(await f.arrayBuffer());
      if (!found.length || !best) throw new Error('No encuentro ninguna hoja con una columna de fecha y otra de siglas (o «Empresa instaladora»).');
      setSheets(found);
      setSheetIdx(found.indexOf(best));
      setCols(guessColumns(best));
      setFileName(f.name.replace(/\.(xlsx|xlsm)$/i, ''));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const visits = useMemo(() => (sheet && cols && cols.date >= 0 && cols.siglas >= 0 ? extractVisits(sheet, cols) : []), [sheet, cols]);

  // Cargar los años de las fechas planificadas antes de comparar con lo que ya hay marcado
  useEffect(() => {
    const years = [...new Set(visits.map((v) => v.date?.slice(0, 4)).filter(Boolean).map(Number))];
    setYearsReady(false);
    Promise.all(years.map((y) => data.loadYear(y))).then(() => setYearsReady(true));
  }, [visits, data.loadYear]);

  const base = useMemo(
    () => (yearsReady ? planChanges(visits, motivo, data.employees.filter((e) => e.activo), data.entries, data.notes) : null),
    [yearsReady, visits, motivo, data.employees, data.entries, data.notes],
  );
  const result = useMemo(() => (base ? withSubstitutes(base, subs, data.entries, data.notes) : null), [base, subs, data.entries, data.notes]);

  // Candidatos para cubrir cada conflicto: de su zona y vecinas primero, menos carga primero
  const staff = useMemo(() => fieldStaff(data.employees, data.ops), [data.employees, data.ops]);
  const absence = useMemo(() => absenceSet(data.codes), [data.codes]);
  const subOptions = (c: { emp: Employee; date: string }) => {
    const planned = new Set((base?.items ?? []).filter((i) => i.date === c.date).map((i) => i.emp.id));
    return candidates(c.emp.zona || '(sin zona)', c.date, staff, data.entries, data.notes, absence, data.ops, { allZones: true, exclude: new Set([c.emp.id]) })
      .sort((a, b) => Number(planned.has(a.emp.id)) - Number(planned.has(b.emp.id)))
      .slice(0, 12)
      .map((x) => ({ ...x, planned: planned.has(x.emp.id) }));
  };

  const apply = async () => {
    if (!result || !motivo.trim()) return;
    if (result.people > MASS_PEOPLE_LIMIT && !admin.active) {
      const ok = await admin.requestAdmin(`La planificación afecta a ${result.people} personas. Los cambios a más de ${MASS_PEOPLE_LIMIT} personas a la vez requieren el modo administrador.`);
      if (!ok) return;
    }
    setBusy(true);
    const ok = await data.applyCombined(result.codes, result.notes, `Planificación «${fileName}» · ${motivo.trim()}`);
    setBusy(false);
    if (ok) {
      toast(`Planificación aplicada: ${result.codes.length} día(s) marcados con ${PLAN_CODE} y ${result.notes.length} nota(s) añadidas. Ctrl+Z la deshace entera.`);
      onClose();
    }
  };

  const colSelect = (label: string, key: 'date' | 'time' | 'siglas', optional = false) => (
    <label>{label}
      <select
        value={cols?.[key] ?? -1}
        onChange={(e) => setCols((c) => c && { ...c, [key]: Number(e.target.value) === -1 && optional ? null : Number(e.target.value) })}
      >
        {optional && <option value={-1}>— Ninguna —</option>}
        {sheet?.headers.map((h) => <option key={h.col} value={h.col}>{h.title}</option>)}
      </select>
    </label>
  );

  const total = result ? result.codes.length + result.notes.length : 0;

  return (
    <Modal title="📥 Importar planificación" wide onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      {sheet && (
        <button className="primary" disabled={!result || !total || !motivo.trim() || busy} onClick={apply}>
          {busy ? 'Aplicando…' : !motivo.trim() ? 'Escribe el motivo' : `Aplicar ${result?.items.length ?? 0} día(s)`}
        </button>
      )}
    </>}>
      {!sheet ? (
        <div className="form">
          <p className="muted">
            Carga el Excel de la planificación. Cada fila debe tener la <b>fecha</b>, la <b>hora</b>, el <b>lugar</b> y las <b>siglas</b> de
            quien va (columna «Siglas» o «Empresa instaladora»). Se marcará <b>{PLAN_CODE}</b> con una nota del motivo, el lugar y la hora.
          </p>
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="form">
          <p className="muted small">Archivo: <b>{fileName}</b> · hoja «{sheet.name}» · {visits.length} visitas</p>
          <label>Motivo del despliegue (irá en la nota) *
            <input autoFocus value={motivo} placeholder="p. ej. Despliegue TPVs DIA" onChange={(e) => setMotivo(e.target.value)} />
          </label>

          <details>
            <summary>Columnas detectadas (cámbialas si alguna no es correcta)</summary>
            <div className="row3">
              {sheets.length > 1 && (
                <label>Hoja
                  <select value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); setCols(guessColumns(sheets[i])); }}>
                    {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                  </select>
                </label>
              )}
              {colSelect('Fecha', 'date')}
              {colSelect('Hora', 'time', true)}
              {colSelect('Siglas', 'siglas')}
            </div>
            <div className="place-cols">
              <span className="small muted">Lugar en la nota:</span>
              {sheet.headers.filter((h) => ![cols?.date, cols?.time, cols?.siglas].includes(h.col)).map((h) => (
                <label key={h.col} className="check small">
                  <input
                    type="checkbox"
                    checked={!!cols?.place.includes(h.col)}
                    onChange={(e) => setCols((c) => c && { ...c, place: e.target.checked ? [...c.place, h.col] : c.place.filter((x) => x !== h.col) })}
                  />
                  {h.title}
                </label>
              ))}
            </div>
          </details>

          {!result ? <p>Comprobando el calendario…</p> : (
            <>
              <div className="stats">
                <div className="stat"><b>{result.visits}</b><span>visitas</span></div>
                <div className="stat"><b>{result.codes.length}</b><span>días a marcar {PLAN_CODE}</span></div>
                <div className="stat"><b>{result.notes.length}</b><span>notas a añadir</span></div>
                <div className="stat"><b>{result.alreadyDone}</b><span>ya estaban</span></div>
              </div>

              {result.conflicts.length > 0 && (
                <div className="danger-box" role="alert">
                  <b>⚠ {result.conflicts.length} día(s) ya tienen otra clave. No se tocarán; puedes elegir un sustituto:</b>
                  <ul className="conflicts">
                    {result.conflicts.map((c) => {
                      const key = conflictKey(c);
                      const opts = subOptions(c);
                      return (
                        <li key={key}>
                          <div><b>{c.code}</b> · {formatDate(c.date)} · {c.emp.siglas} {c.emp.nombre} — planificado: {c.visit}</div>
                          <select
                            value={subs.get(key)?.id ?? ''}
                            aria-label={`Sustituto de ${c.emp.nombre} el ${formatDate(c.date)}`}
                            onChange={(e) => setSubs((m) => {
                              const n = new Map(m);
                              const emp = opts.find((o) => o.emp.id === e.target.value)?.emp;
                              if (emp) n.set(key, emp); else n.delete(key);
                              return n;
                            })}
                          >
                            <option value="">— Sin sustituto (no se marca) —</option>
                            {opts.map((o) => (
                              <option key={o.emp.id} value={o.emp.id}>
                                {o.emp.siglas || '—'} {o.emp.nombre} · {o.emp.zona} · {o.status === 'libre' ? 'libre' : 'en cliente'} · PC semana {o.weekLoad}{o.planned ? ' · ya va otra visita ese día' : ''}
                              </option>
                            ))}
                          </select>
                          {!opts.length && <span className="small"> No hay nadie disponible ese día.</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {result.unknownSiglas.size > 0 && (
                <div className="warn-box">
                  <b>Siglas sin persona en el calendario:</b>{' '}
                  {[...result.unknownSiglas].map(([s, n]) => `${s} (${n} visita${n > 1 ? 's' : ''})`).join(', ')}.
                  {' '}Esas visitas no se marcan. Pon las siglas en <b>Ajustes → Editar</b> y vuelve a importar.
                </div>
              )}
              {result.noDate.length > 0 && (
                <div className="warn-box">Filas sin fecha válida (no se importan): {result.noDate.join(', ')}.</div>
              )}

              {result.items.length > 0 && (
                <div className="table-scroll plan-preview">
                  <table className="table small">
                    <thead><tr><th>Fecha</th><th>Persona</th><th>Clave</th><th>Nota que se añade</th></tr></thead>
                    <tbody>
                      {result.items.slice(0, 200).map((it) => (
                        <tr key={`${it.emp.id}${it.date}`}>
                          <td className="nowrap">{formatDate(it.date)}</td>
                          <td><b>{it.emp.siglas}</b> {it.emp.nombre}{it.replaces && <span className="tag">sustituye a {it.replaces.siglas || it.replaces.nombre}</span>}</td>
                          <td>{it.setCode ? PLAN_CODE : <span className="muted">ya {PLAN_CODE}</span>}</td>
                          <td className="small">{it.note || <span className="muted">—</span>}{it.hadNote && <span className="tag gray">se añade a la nota existente</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.people > MASS_PEOPLE_LIMIT && !admin.active && (
                <p className="warn-box">🔒 Afecta a {result.people} personas: al confirmar se pedirá la contraseña de administrador.</p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
