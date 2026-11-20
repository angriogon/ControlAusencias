import { useEffect, useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import type { AppUser } from '../types';
import { SummaryView } from './SummaryView';
import { CommandCenter } from './ops/CommandCenter';
import { CoverageMap, WhoCanGo } from './ops/Coverage';
import { Workload, Balances } from './ops/Figures';
import { ReportDialog } from './ops/ReportDialog';
import { Agenda } from './ops/Agenda';

export type Sub = 'hoy' | 'agenda' | 'cobertura' | 'cifras';

const SUBS: [Sub, string][] = [
  ['hoy', '🎯 Centro de mando'],
  ['agenda', '📆 Agenda y tareas'],
  ['cobertura', '🗺️ Cobertura'],
  ['cifras', '🧮 Cifras'],
];

type CovMode = 'mapa' | 'quien';

type NumMode = 'saldos' | 'carga' | 'resumen';

/** Destinos a los que se puede saltar desde otros paneles. */
export type Go = Sub | CovMode | NumMode;

const COV: [CovMode, string][] = [['mapa', 'Mapa de zonas'], ['quien', '🙋 ¿Quién puede ir?']];

const NUM: [NumMode, string][] = [['saldos', 'Saldos'], ['carga', 'Carga de PC'], ['resumen', 'Resumen del año']];

/** Lee lo guardado en el navegador (también nombres de subpestañas antiguas). */
function storedSub(): { sub: Sub; cov: CovMode; num: NumMode } {
  let v = '', c = '', n = '';
  try { v = localStorage.getItem('ca-ops-sub') ?? ''; c = localStorage.getItem('ca-ops-cov') ?? ''; n = localStorage.getItem('ca-ops-num') ?? ''; } catch { /* */ }
  const cov: CovMode = v === 'quien' ? 'quien' : c === 'quien' ? 'quien' : 'mapa';
  const num: NumMode = v === 'carga' || n === 'carga' ? 'carga' : n === 'resumen' ? 'resumen' : 'saldos';
  const sub: Sub = SUBS.some(([k]) => k === v) ? (v as Sub)
    : v === 'quien' ? 'cobertura' : v === 'carga' || v === 'saldos' ? 'cifras' : 'hoy';
  return { sub, cov, num };
}

export function OpsView({ store, data, user, onGoto, initialSub }: {
  store: DataStore; data: AppData; user: AppUser;
  onGoto: (employeeId: string, date: string) => void;
  /** Subpestaña pedida desde fuera (p. ej. el resumen de arriba); cambia la actual. */
  initialSub?: { sub: Sub; n: number } | null;
}) {
  const [init] = useState(storedSub);
  const [sub, setSub] = useState<Sub>(init.sub);
  const [cov, setCov] = useState<CovMode>(init.cov);
  const [num, setNum] = useState<NumMode>(init.num);
  useEffect(() => { if (initialSub) setSub(initialSub.sub); }, [initialSub?.n]);
  const [ask, setAsk] = useState<{ zona: string; date: string } | null>(null);
  const [report, setReport] = useState(false);
  useEffect(() => {
    try { localStorage.setItem('ca-ops-sub', sub); localStorage.setItem('ca-ops-cov', cov); localStorage.setItem('ca-ops-num', num); } catch { /* */ }
  }, [sub, cov, num]);

  const go = (to: Go) => {
    if (to === 'mapa' || to === 'quien') { setCov(to); setSub('cobertura'); }
    else if (to === 'saldos' || to === 'carga' || to === 'resumen') { setNum(to); setSub('cifras'); }
    else setSub(to);
  };
  const askWho = (zona: string, date: string) => { setAsk({ zona, date }); go('quien'); };
  const seg = <T extends string>(opts: [T, string][], cur: T, set: (v: T) => void) => (
    <div className="seg inner-seg">{opts.map(([k, l]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>
  );

  return (
    <div className="page ops">
      <nav className="subtabs" aria-label="Operativa" title={`Técnicos de campo: ${data.ops.equipos.join(', ')}`}>
        {SUBS.map(([k, label]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{label}</button>)}
        <button className="subtabs-end" onClick={() => setReport(true)}>📄 Informe mensual</button>
      </nav>
      {sub === 'hoy' && <CommandCenter store={store} data={data} user={user} onAsk={askWho} onGo={go} onGoto={onGoto} />}
      {sub === 'agenda' && <Agenda data={data} onGoto={onGoto} />}
      {sub === 'cobertura' && <>
        {seg(COV, cov, setCov)}
        {cov === 'mapa' ? <CoverageMap data={data} onAsk={askWho} /> : <WhoCanGo data={data} initial={ask} />}
      </>}
      {sub === 'cifras' && <>
        {seg(NUM, num, setNum)}
        {num === 'saldos' && <Balances data={data} />}
        {num === 'carga' && <Workload data={data} />}
        {num === 'resumen' && <SummaryView data={data} />}
      </>}
      {report && <ReportDialog data={data} onClose={() => setReport(false)} />}
    </div>
  );
}
