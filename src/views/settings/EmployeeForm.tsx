import { useState } from 'react';
import type { Employee } from '../../types';
import { Modal } from '../../components/ui';
import { fillSiglas, makeSiglas, normSiglas } from '../../lib/siglas';

export function EmployeeForm({ initial, isNew, others = [], onClose, onSave }: {
  initial: Employee; isNew: boolean; others?: Employee[]; onClose: () => void; onSave: (e: Employee) => void;
}) {
  const [e, setE] = useState(initial);
  const sig = normSiglas(e.siglas ?? '');
  const dupe = sig ? others.find((o) => o.id !== e.id && normSiglas(o.siglas ?? '') === sig) : undefined;
  const suggest = () => {
    const used = others.filter((o) => o.id !== e.id);
    const [mine] = fillSiglas([...used, { ...e, siglas: '' }]).slice(-1);
    setE((x) => ({ ...x, siglas: mine.siglas || makeSiglas(x.nombre) }));
  };
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setE((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Employee, label: string, ph = '') => (
    <label>{label}<input value={String(e[k] ?? '')} placeholder={ph} onChange={(ev) => set(k, ev.target.value as never)} /></label>
  );
  const num = (k: keyof Employee, label: string) => (
    <label>{label}<input type="number" step="0.5" value={Number(e[k] ?? 0)} onChange={(ev) => set(k, Number(ev.target.value) as never)} /></label>
  );
  return (
    <Modal title={isNew ? 'Añadir persona' : `Editar · ${initial.nombre}`} wide onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={!e.nombre.trim() || busy || !!dupe} onClick={async () => { setBusy(true); await onSave({ ...e, nombre: e.nombre.trim(), siglas: sig }); setBusy(false); }}>
        Guardar
      </button>
    </>}>
      <div className="form grid2">
        {text('nombre', 'Nombre completo *')}
        <label>Siglas (las de las planificaciones)
          <span className="inline-field">
            <input value={e.siglas ?? ''} maxLength={10} placeholder="p. ej. AMRG" onChange={(ev) => set('siglas', ev.target.value.toUpperCase())} />
            <button type="button" onClick={suggest} title="Proponer a partir del nombre">Proponer</button>
          </span>
          {dupe && <span className="error small">Ya las tiene {dupe.nombre}</span>}
        </label>
        {text('sede', 'Sede / puesto', 'p. ej. DISPATCHER 1 SEV')}
        {text('equipo', 'Equipo', 'DISPATCH, ALMACEN, TEC.P…')}
        {text('zona', 'Zona', 'Sev, Cen, Lev…')}
        {text('teamLeader', 'Team leader')}
        {text('almacen', 'Almacén VK')}
        {text('telefono', 'Teléfono')}
        {text('extension', 'Extensión')}
        {text('guardias', 'Guardias')}
        {num('diasVacaciones', 'Días de vacaciones del año')}
        {num('vpPendientes', 'Vacaciones pendientes año anterior (VP)')}
        {num('diasLh', 'Días libre por horas (LH)')}
        <label className="span2">Notas<textarea rows={2} value={e.notas} onChange={(ev) => set('notas', ev.target.value)} /></label>
      </div>
    </Modal>
  );
}
