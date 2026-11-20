import { useState } from 'react';
import type { AppData } from '../../data/useAppData';
import { MONTHS, parseIso, todayIso } from '../../lib/dates';
import { Modal, useUi } from '../../components/ui';

// =====================================================================
// Informe mensual
// =====================================================================
export function ReportDialog({ data, onClose }: { data: AppData; onClose: () => void }) {
  const { toast } = useUi();
  const t = parseIso(todayIso());
  const [ym, setYm] = useState(() => (t.m0 ? { y: t.y, m: t.m0 - 1 } : { y: t.y - 1, m: 11 }));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await data.loadYear(ym.y);
      const { exportOpsReport } = await import('../../lib/opsReport');
      await exportOpsReport(data.employees, data.codes, data.entries, data.notes, data.ops, ym.y, ym.m);
      toast('Informe descargado');
      onClose();
    } catch (e) { toast(`No se pudo generar: ${(e as Error).message}`, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="📄 Informe mensual" onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={busy} onClick={run}>{busy ? 'Generando…' : 'Descargar Excel'}</button>
    </>}>
      <div className="form">
        <p className="muted">Para tu responsable: absentismo por zona y tipo, días de PC, días con la cobertura en riesgo, detalle por persona y saldos del año.</p>
        <div className="row2">
          <label>Mes<select value={ym.m} onChange={(e) => setYm({ ...ym, m: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
          <label>Año<input type="number" value={ym.y} onChange={(e) => setYm({ ...ym, y: Number(e.target.value) || ym.y })} /></label>
        </div>
      </div>
    </Modal>
  );
}
