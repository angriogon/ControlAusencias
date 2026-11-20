/** Cada cuántos días se recuerda exportar a Excel (copia fuera de Supabase). */
export const EXPORT_EVERY_DAYS = 7;

/** Días desde la última exportación (Infinity si nunca se ha exportado). */
export const exportDays = (iso: string | null, now = Date.now()) =>
  (iso ? (now - new Date(iso).getTime()) / 86_400_000 : Infinity);
