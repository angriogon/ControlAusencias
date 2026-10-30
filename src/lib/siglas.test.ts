import { describe, expect, it } from 'vitest';
import { fillSiglas, makeSiglas } from './siglas';
import type { Employee } from '../types';

describe('siglas', () => {
  it('genera iniciales de nombre y apellidos', () => {
    expect(makeSiglas('ÁNGEL MANUEL RÍOS GOÑI')).toBe('AMRG');
    expect(makeSiglas('BORTELANO GARCÍA, JUAN MANUEL(especialista)')).toBe('JMBG');
    expect(makeSiglas('GALLARDO DE LOS SANTOS, MIGUEL ANGEL')).toBe('MAGS');
    expect(makeSiglas('JESUS PIZARRAYA (Agencia Tributaria) No cubrimos, si REMOTO')).toBe('JP');
    expect(makeSiglas('RODRIGO DOMINGUEZ GARCIA-VAO (In plant carrefour)')).toBe('RDG');
    expect(makeSiglas('MIRIAM DE LA GUARDIA CALDERA (UNEI)')).toBe('MGC');
  });
  it('no repite siglas y respeta las ya puestas', () => {
    const e = (nombre: string, siglas = '') => ({ id: nombre, nombre, siglas } as Employee);
    const r = fillSiglas([e('Juan Pérez'), e('Julia Pinto'), e('Ana López', 'JP')]);
    expect(r.map((x) => x.siglas)).toEqual(['JP2', 'JP3', 'JP']);
  });
});
