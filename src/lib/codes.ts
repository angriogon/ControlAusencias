import type { Code } from '../types';

/**
 * Claves por defecto, sacadas de la leyenda del Excel ("Claves de Ausencias" y
 * "Otras claves de Control"). Los colores de las ausencias son los mismos que en
 * el Excel para que el equipo los reconozca a la primera.
 */
export const DEFAULT_CODES: Code[] = [
  { code: 'V', label: 'Vacaciones', color: '#00B050', textColor: '#FFFFFF', category: 'ausencia' },
  { code: 'VP', label: 'Vacaciones pendientes año anterior', color: '#92D050', textColor: '#000000', category: 'ausencia' },
  { code: 'FL', label: 'Fiesta local', color: '#002060', textColor: '#FFFFFF', category: 'ausencia' },
  { code: 'P', label: 'Permiso reglamentario', color: '#0070C0', textColor: '#FFFFFF', category: 'ausencia' },
  { code: 'Lf', label: 'Libre por festivo', color: '#00B0F0', textColor: '#000000', category: 'ausencia' },
  { code: 'Lh', label: 'Libre por horas', color: '#8FAADC', textColor: '#000000', category: 'ausencia' },
  { code: 'B', label: 'Baja por enfermedad', color: '#FFFF00', textColor: '#000000', category: 'ausencia' },
  { code: 'F', label: 'Formación', color: '#C00000', textColor: '#FFFFFF', category: 'ausencia' },
  { code: 'FN', label: 'Fiesta nacional', color: '#7030A0', textColor: '#FFFFFF', category: 'ausencia' },
  { code: 'A', label: 'Ausente', color: '#808080', textColor: '#FFFFFF', category: 'ausencia' },
  { code: 'TF', label: 'Trabaja festivo', color: '#FFE699', textColor: '#7F6000', category: 'control' },
  { code: 'TS', label: 'Trabaja sábado', color: '#F8CBAD', textColor: '#833C0B', category: 'control' },
  { code: 'PC', label: 'Presencial en cliente', color: '#DDEBF7', textColor: '#1F4E79', category: 'control' },
  { code: 'CZ', label: 'Cubre zona', color: '#D9D2E9', textColor: '#002060', category: 'control' },
  { code: 'PC/MJ M', label: 'Presencial en cliente media jornada de mañana', color: '#BDD7EE', textColor: '#1F4E79', category: 'control' },
  { code: 'MJ', label: 'Trabaja media jornada', color: '#E2EFDA', textColor: '#375623', category: 'control' },
  { code: 'PC/MJ T', label: 'Presencial en cliente media jornada de tarde', color: '#FF6161', textColor: '#FFFFFF', category: 'control' },
  { code: 'DT', label: 'Descansa tarde', color: '#E7E6E6', textColor: '#3A3838', category: 'control' },
  { code: 'JC', label: 'Jornada continua (almacén, no paran a mediodía)', color: '#2F75B5', textColor: '#FFFFFF', category: 'control' },
  { code: 'TT', label: 'Teletrabajo', color: '#44546A', textColor: '#FFFF00', category: 'control' },
].map((c, i) => ({ ...c, category: c.category as Code['category'], orden: i, activo: true }));

/**
 * Busca la clave oficial para un texto escrito a mano: ignora mayúsculas y
 * espacios ("pc" → "PC", "LH" → "Lh", " v " → "V").
 */
export function normalizeCode(raw: string, codes: Code[]): string | null {
  const t = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!t) return null;
  const hit = codes.find((c) => c.code.toUpperCase() === t);
  return hit ? hit.code : null;
}

export function codeMap(codes: Code[]): Map<string, Code> {
  return new Map(codes.map((c) => [c.code, c]));
}
