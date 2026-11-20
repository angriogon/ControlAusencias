import { useState } from 'react';
import type { Code } from '../../types';
import { Modal } from '../../components/ui';

export function CodeForm({ initial, isNew, onClose, onSave }: {
  initial: Code; isNew: boolean; onClose: () => void; onSave: (c: Code, isNew: boolean) => void;
}) {
  const [c, setC] = useState(initial);
  return (
    <Modal title={isNew ? 'Nueva clave' : `Editar clave ${initial.code}`} onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" onClick={() => onSave(c, isNew)}>Guardar</button>
    </>}>
      <div className="form">
        <label>Clave (lo que aparece en la celda)<input value={c.code} disabled={!isNew} maxLength={10} onChange={(e) => setC({ ...c, code: e.target.value })} /></label>
        <label>Significado<input value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} /></label>
        <div className="row2">
          <label>Color de fondo<input type="color" value={c.color} onChange={(e) => setC({ ...c, color: e.target.value.toUpperCase() })} /></label>
          <label>Color del texto<input type="color" value={c.textColor} onChange={(e) => setC({ ...c, textColor: e.target.value.toUpperCase() })} /></label>
        </div>
        <label>Tipo
          <select value={c.category} onChange={(e) => setC({ ...c, category: e.target.value as Code['category'] })}>
            <option value="ausencia">Ausencia (cuenta en el total del día)</option>
            <option value="control">Control (solo informativa)</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={c.activo} onChange={(e) => setC({ ...c, activo: e.target.checked })} /> En uso (si se desmarca, deja de salir en la paleta pero se conservan las marcas)</label>
        <div>Vista previa: <span className="chip" style={{ background: c.color, color: c.textColor }}>{c.code || '?'}</span></div>
      </div>
    </Modal>
  );
}
