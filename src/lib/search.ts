/** Texto para buscar sin distinguir mayúsculas ni tildes: «Ríos» → «rios». */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿Contiene alguno de los campos el texto buscado? (sin tildes ni mayúsculas) */
export const matches = (query: string, ...fields: (string | undefined)[]) => {
  const q = fold(query.trim());
  return !q || fold(fields.filter(Boolean).join(' ')).includes(q);
};
