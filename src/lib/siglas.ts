import type { Employee } from '../types';

const PARTICLES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'E', 'DA', 'DO', 'DI', 'VAN', 'VON']);
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Siglas a partir del nombre: iniciales del nombre y apellidos.
 *  «ÁNGEL MANUEL RÍOS GOÑI»                         → AMRG
 *  «BORTELANO GARCÍA, JUAN MANUEL(especialista)»    → JMBG (con coma: «Apellidos, Nombre»)
 *  «GALLARDO DE LOS SANTOS, MIGUEL ANGEL»           → MAGS (sin partículas)
 * Lo que va entre paréntesis o detrás se ignora. Es una propuesta: se revisa en Ajustes.
 */
export function makeSiglas(nombre: string): string {
  let base = nombre.split('(')[0].trim();
  if (base.includes(',')) {
    const [apellidos, nom] = base.split(',', 2);
    base = `${nom} ${apellidos}`;
  }
  const words = strip(base).toUpperCase().replace(/[^A-Z\s-]/g, ' ').split(/\s+/).filter((w) => w && !PARTICLES.has(w));
  return words.map((w) => w[0]).join('').slice(0, 6);
}

export const normSiglas = (s: string) => strip(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Conserva las siglas ya asignadas al sustituir las fichas (importar el Excel, que no
 * trae siglas). Se emparejan por nombre (sin tildes, mayúsculas ni espacios de más) y
 * solo se rellenan las fichas nuevas que vengan sin siglas, sin repetir ninguna.
 */
export function keepSiglas(incoming: Employee[], current: Employee[]): { employees: Employee[]; kept: number } {
  const key = (n: string) => strip(n).toLowerCase().replace(/\s+/g, ' ').trim();
  const prev = new Map<string, string>();
  for (const e of current) {
    const k = key(e.nombre);
    if (normSiglas(e.siglas ?? '') && (!prev.has(k) || e.activo)) prev.set(k, e.siglas);
  }
  const used = new Set(incoming.map((e) => normSiglas(e.siglas ?? '')).filter(Boolean));
  let kept = 0;
  const employees = incoming.map((e) => {
    if (normSiglas(e.siglas ?? '')) return e;
    const s = prev.get(key(e.nombre));
    if (!s || used.has(normSiglas(s))) return e;
    used.add(normSiglas(s));
    kept++;
    return { ...e, siglas: s };
  });
  return { employees, kept };
}

/**
 * Asigna siglas a quien no tenga, sin repetir ninguna (si ya existe, añade 2, 3…).
 * No toca las siglas que ya estén puestas.
 */
export function fillSiglas(list: Employee[]): Employee[] {
  const used = new Set(list.map((e) => normSiglas(e.siglas ?? '')).filter(Boolean));
  return list.map((e) => {
    if (normSiglas(e.siglas ?? '')) return e;
    const base = makeSiglas(e.nombre) || 'X';
    let s = base;
    for (let n = 2; used.has(s); n++) s = `${base}${n}`;
    used.add(s);
    return { ...e, siglas: s };
  });
}
