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
