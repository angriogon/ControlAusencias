import { useEffect } from 'react';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { useUi } from './ui';

const SEEN = 'ca-version-vista';

/**
 * Tras una actualización, un aviso con la versión nueva y un enlace a las novedades
 * (una vez por versión y navegador).
 */
export function useUpdateNotice(open: () => void) {
  const { toast } = useUi();
  useEffect(() => {
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN); localStorage.setItem(SEEN, APP_VERSION); } catch { return; }
    if (seen !== APP_VERSION) {
      toast(`🆕 Actualizada a la v${APP_VERSION}: ${CHANGELOG[0].title}`, 'info', { label: 'Ver novedades', run: open });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
