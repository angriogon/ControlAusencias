import { describe, expect, it } from 'vitest';
import type { Employee, Entry, Note, OpsConfig } from '../types';
import { DEFAULT_CODES } from './codes';
import { absenceSet, balances, candidates, coverageImpact, dataIssues, fieldStaff, median, ongoingSickLeaves, pcLoad, workWeek, zoneDay } from './ops';

const emp = (id: string, zona: string, extra: Partial<Employee> = {}): Employee => ({
  id, nombre: id, siglas: id.toUpperCase(), telefono: '', extension: '', almacen: '', teamLeader: '', equipo: 'TEC.P',
  zona, guardias: '', sede: '', diasVacaciones: 25, vpPendientes: 0, diasLh: 0, notas: '', orden: 0, activo: true, ...extra,
});
const entries = (list: [string, string, string][]) => new Map<string, Entry>(list.map(([id, date, code]) => [`${id}|${date}`, { employeeId: id, date, code }]));
const cfg: OpsConfig = { equipos: ['TEC.P', 'COLAB'], zonas: { Sev: { minimo: 1, vecinas: ['Cad'] } } };
const abs = absenceSet(DEFAULT_CODES);
const none = new Map<string, Note>();
const staff = [emp('a', 'Sev'), emp('b', 'Sev'), emp('c', 'Cad'), emp('d', 'Mur'), emp('x', 'Sev', { equipo: 'ALMACEN' })];
const D = '2026-11-04'; // miércoles

describe('operativa', () => {
  it('solo cuenta equipos de campo activos', () => {
    expect(fieldStaff(staff, cfg).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('nivel de cobertura: ok, justo, bajo y festivo', () => {
    const f = fieldStaff(staff, cfg);
    expect(zoneDay('Sev', D, f, entries([]), none, abs, cfg).level).toBe('ok');
    expect(zoneDay('Sev', D, f, entries([['a', D, 'V']]), none, abs, cfg).level).toBe('justo');
    expect(zoneDay('Sev', D, f, entries([['a', D, 'V'], ['b', D, 'B']]), none, abs, cfg).level).toBe('bajo');
    expect(zoneDay('Sev', D, f, entries([['a', D, 'FL'], ['b', D, 'FL']]), none, abs, cfg).level).toBe('festivo');
    // PC sigue contando como trabajando
    const z = zoneDay('Sev', D, f, entries([['a', D, 'PC'], ['b', D, 'V']]), none, abs, cfg);
    expect(z.level).toBe('justo');
    expect(z.enCliente.map((x) => x.emp.id)).toEqual(['a']);
  });

  it('semana laborable de lunes a viernes', () => {
    expect(workWeek(D)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  });

  it('carga de PC con medias jornadas', () => {
    const l = pcLoad(staff, entries([['a', D, 'PC'], ['a', '2026-11-05', 'PC/MJ M'], ['b', D, 'V']]), '2026-11-01', '2026-11-30');
    expect(l.get('a')).toBe(1.5);
    expect(l.get('b')).toBe(0);
    expect(median([1, 5, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('candidatos: zona, vecinas, libres antes y menos carga', () => {
    const f = fieldStaff(staff, cfg);
    const en = entries([['a', '2026-11-03', 'PC'], ['b', D, 'V'], ['c', D, 'PC']]);
    expect(candidates('Sev', D, f, en, none, abs, cfg).map((c) => c.emp.id)).toEqual(['a', 'c']);
    expect(candidates('Sev', D, f, en, none, abs, cfg, { allZones: true }).map((c) => `${c.emp.id}${c.rank}`)).toEqual(['a0', 'c1', 'd2']);
    const two = fieldStaff([emp('p', 'Sev'), emp('q', 'Sev')], cfg);
    expect(candidates('Sev', D, two, entries([['p', '2026-11-02', 'PC']]), none, abs, cfg).map((c) => c.emp.id)).toEqual(['q', 'p']);
  });

  it('aviso al dejar una zona por debajo del mínimo', () => {
    const en = entries([['a', D, 'V']]);
    expect(coverageImpact([{ employeeId: 'b', date: D, code: 'V' }], staff, en, DEFAULT_CODES, cfg)).toEqual([{ zona: 'Sev', date: D, working: 0, min: 1 }]);
    expect(coverageImpact([{ employeeId: 'b', date: D, code: 'PC' }], staff, en, DEFAULT_CODES, cfg)).toEqual([]);
    // Fin de semana y personas que no son de campo no avisan
    expect(coverageImpact([{ employeeId: 'b', date: '2026-11-07', code: 'V' }], staff, en, DEFAULT_CODES, cfg)).toEqual([]);
    expect(coverageImpact([{ employeeId: 'd', date: D, code: 'V' }], staff, new Map(), DEFAULT_CODES, { ...cfg, zonas: { Mur: { minimo: 0, vecinas: [] } } })).toEqual([]);
  });

  it('saldos y bajas en curso', () => {
    const en = entries([['a', '2026-03-02', 'V'], ['a', '2026-03-07', 'TS'], ['a', '2026-03-09', 'Lf'],
      ['b', '2026-10-29', 'B'], ['b', '2026-10-30', 'B'], ['b', '2026-11-02', 'B']]);
    const b = balances(staff, en, 2026).find((x) => x.emp.id === 'a')!;
    expect([b.vacLeft, b.worked, b.compensated]).toEqual([24, 1, 1]);
    expect(ongoingSickLeaves(staff, en, '2026-11-02').map((x) => [x.emp.id, x.since, x.days])).toEqual([['b', '2026-10-29', 3]]);
  });

  it('revisión de datos', () => {
    const r = dataIssues([emp('a', 'Sev', { siglas: '' }), emp('z', '', { equipo: 'ALMACEN', diasVacaciones: 0 })],
      entries([['a', D, 'FS'], ['a', '2026-11-05', 'XX']]), [...DEFAULT_CODES, { ...DEFAULT_CODES[0], code: 'FS', label: 'FS (importada, revisar)' }], cfg, 2026);
    expect(r.people.map((p) => [p.emp.id, p.problems.length])).toEqual([['a', 1], ['z', 2]]);
    expect([...r.unknownCodes]).toEqual([['XX', 1]]);
    expect([...r.reviewCodes]).toEqual([['FS', 1]]);
  });
});
