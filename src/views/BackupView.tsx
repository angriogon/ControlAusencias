import { useEffect, useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import type { ExcelSync } from '../data/useExcelSync';
import type { AppUser } from '../types';
import { HistoryView } from './HistoryView';
import { DataView } from './DataView';

export type BackupSub = 'historial' | 'copias' | 'excel';
const SUBS: [BackupSub, string][] = [
  ['historial', '🕘 Historial'],
  ['copias', '💾 Copias de seguridad'],
  ['excel', '📗 Excel'],
];
const KEY = 'ca-backup-sub';

/** Todo lo de «volver atrás» y el Excel: historial de cambios, copias completas y sincronización/exportación. */
export function BackupView({ store, data, user, sync, initialSub }: {
  store: DataStore; data: AppData; user: AppUser; sync: ExcelSync;
  initialSub?: { sub: BackupSub; n: number } | null;
}) {
  const [sub, setSub] = useState<BackupSub>(() => {
    try { const v = localStorage.getItem(KEY) as BackupSub; return SUBS.some(([k]) => k === v) ? v : 'historial'; } catch { return 'historial'; }
  });
  useEffect(() => { if (initialSub) setSub(initialSub.sub); }, [initialSub?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(KEY, sub); } catch { /* */ } }, [sub]);

  return (
    <div className="page">
      <nav className="subtabs" aria-label="Historial y copias">
        {SUBS.map(([k, label]) => (
          <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>
            {label}{k === 'excel' && sync.stale != null ? ' ⚠' : ''}
          </button>
        ))}
      </nav>
      {sub === 'historial' && <HistoryView store={store} data={data} />}
      {sub === 'copias' && <DataView store={store} data={data} user={user} sync={sync} part="copias" />}
      {sub === 'excel' && <DataView store={store} data={data} user={user} sync={sync} part="excel" />}
    </div>
  );
}
