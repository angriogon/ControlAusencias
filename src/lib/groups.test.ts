import { describe, expect, it } from 'vitest';
import { contactText, groupOf, parseGroups, removeGroup, setGroup } from './groups';
import { keepSiglas } from './siglas';
import { DEFAULT_GROUPS, type Employee } from '../types';

const emp = (nombre: string, siglas = '', extra: Partial<Employee> = {}): Employee => ({
  id: crypto.randomUUID(), nombre, siglas, telefono: '', extension: '', almacen: '', teamLeader: '', equipo: '', zona: '',
  guardias: '', sede: '', diasVacaciones: 25, vpPendientes: 0, diasLh: 0, notas: '', orden: 0, activo: true, ...extra,
});

describe('grupos de personal', () => {
  it('sin ajuste guardado usa los grupos por defecto', () => {
    expect(parseGroups(undefined).lista.map((g) => g.nombre)).toEqual(['UNEI', 'INPLANT', 'COLABORADORES', 'SUBCONTRATAS']);
    expect(parseGroups({ lista: 'roto' }).lista).toEqual(DEFAULT_GROUPS.lista);
  });

  it('asigna por nombre: vale para otra ficha con el mismo nombre (reimportación)', () => {
    const cfg = setGroup(DEFAULT_GROUPS, emp('José  Pérez'), 'unei');
    expect(groupOf(cfg, emp('JOSE PEREZ'))?.nombre).toBe('UNEI');
    expect(groupOf(setGroup(cfg, emp('jose perez'), null), emp('José Pérez'))).toBeUndefined();
  });

  it('quitar un grupo lo quita también a sus personas', () => {
    const cfg = removeGroup(setGroup(DEFAULT_GROUPS, emp('Ana'), 'inplant'), 'inplant');
    expect(cfg.lista.some((g) => g.id === 'inplant')).toBe(false);
    expect(Object.keys(cfg.personas)).toHaveLength(0);
  });
});

describe('copiar nombre y teléfono', () => {
  it('NOMBRE en mayúsculas y el teléfono debajo', () => {
    expect(contactText(emp('Ángel Ríos', '', { telefono: ' 600 111 222 ' }))).toBe('ÁNGEL RÍOS\n600 111 222');
  });
  it('sin teléfono, solo el nombre', () => {
    expect(contactText(emp('ana gil'))).toBe('ANA GIL');
  });
});

describe('conservar siglas al importar', () => {
  it('recupera las siglas por nombre en las fichas nuevas que vienen sin ellas', () => {
    const current = [emp('ÁNGEL MANUEL RÍOS GOÑI', 'AMRG'), emp('Ana Gil', 'AG')];
    const { employees, kept } = keepSiglas([emp('Angel Manuel Rios  Goñi'), emp('Nuevo'), emp('ANA GIL', 'XX')], current);
    expect(kept).toBe(1);
    expect(employees.map((e) => e.siglas)).toEqual(['AMRG', '', 'XX']);
  });

  it('no repite unas siglas que ya trae otra ficha', () => {
    const { employees, kept } = keepSiglas([emp('Ana Gil'), emp('Otro', 'AG')], [emp('Ana Gil', 'AG')]);
    expect(kept).toBe(0);
    expect(employees[0].siglas).toBe('');
  });
});
