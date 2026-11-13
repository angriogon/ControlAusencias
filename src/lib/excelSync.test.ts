import { describe, expect, it } from 'vitest';
import type { Dataset, Employee, Entry, Note } from '../types';
import { DEFAULT_CODES } from './codes';
import { deserializeSnapshot, personKey, planSync, serializeSnapshot, snapshotOf } from './excelSync';

const emp = (id: string, nombre: string): Employee => ({ id, nombre, activo: true } as Employee);
// En el Excel cada lectura da ids nuevos: se cruza por nombre
const excel = (cells: [string, string, string?, string?][]): Dataset => {
  const names = [...new Set(cells.map((c) => c[0]))];
  const employees = names.map((n, i) => emp(`x${i}-${Math.random()}`, n));
  const id = (n: string) => employees.find((e) => e.nombre === n)!.id;
  return {
    employees, codes: DEFAULT_CODES,
    entries: cells.filter((c) => c[2]).map(([n, date, code]) => ({ employeeId: id(n), date, code: code! })),
    notes: cells.filter((c) => c[3]).map(([n, date, , text]) => ({ employeeId: id(n), date, text: text!, author: '' })),
  };
};
const app = [emp('a', 'Ana Pérez'), emp('b', 'Beatriz Gil')];
const ent = (list: [string, string, string][]) => new Map<string, Entry>(list.map(([id, date, code]) => [`${id}|${date}`, { employeeId: id, date, code }]));
const nts = (list: [string, string, string][]) => new Map<string, Note>(list.map(([id, date, text]) => [`${id}|${date}`, { employeeId: id, date, text, author: '' }]));

describe('sincronización Excel → app', () => {
  it('cruza por nombre sin tildes ni mayúsculas', () => {
    expect(personKey('  ANA  PÉREZ ')).toBe(personKey('Ana Perez'));
  });

  it('solo aplica lo que cambia en el Excel y conserva lo hecho en la app', () => {
    const prev = snapshotOf(excel([['ANA PEREZ', '2026-11-02', 'V'], ['Beatriz Gil', '2026-11-03', 'PC']]));
    const next = snapshotOf(excel([['ANA PEREZ', '2026-11-02', 'V'], ['ANA PEREZ', '2026-11-04', 'B', 'baja'], ['Beatriz Gil', '2026-11-03', 'PC']]));
    // En la app, Beatriz tiene una tarea el día 5 que el Excel no tiene: debe quedarse
    const p = planSync(prev, next, app, ent([['a', '2026-11-02', 'V'], ['b', '2026-11-03', 'PC']]), nts([['b', '2026-11-05', '📌 Tarea · llamar']]), DEFAULT_CODES);
    expect(p.cells).toEqual([{ employeeId: 'a', date: '2026-11-04', code: 'B' }]);
    expect(p.notes).toEqual([{ employeeId: 'a', date: '2026-11-04', text: 'baja' }]);
    expect(p.overwritten).toBe(0);
  });

  it('gana el Excel si cambia una celda tocada en la app, y borra lo que se borra en el Excel', () => {
    const prev = snapshotOf(excel([['Ana Pérez', '2026-11-02', 'V'], ['Ana Pérez', '2026-11-03', 'V']]));
    const next = snapshotOf(excel([['Ana Pérez', '2026-11-02', 'P'], ['Ana Pérez', '2026-11-09', 'V']]));
    const p = planSync(prev, next, app, ent([['a', '2026-11-02', 'PC'], ['a', '2026-11-03', 'V']]), new Map(), DEFAULT_CODES);
    expect(p.cells).toEqual(expect.arrayContaining([
      { employeeId: 'a', date: '2026-11-02', code: 'P' },
      { employeeId: 'a', date: '2026-11-03', code: null },
      { employeeId: 'a', date: '2026-11-09', code: 'V' },
    ]));
    expect(p.overwritten).toBe(1);
  });

  it('primera vez: añade lo del Excel sin borrar lo de la app', () => {
    const next = snapshotOf(excel([['Ana Pérez', '2026-11-02', 'V']]));
    const p = planSync(null, next, app, ent([['b', '2026-11-03', 'PC']]), new Map(), DEFAULT_CODES);
    expect(p.cells).toEqual([{ employeeId: 'a', date: '2026-11-02', code: 'V' }]);
  });

  it('avisa de personas y claves desconocidas sin tocarlas', () => {
    const next = snapshotOf(excel([['Carlos Nuevo', '2026-11-02', 'V'], ['Ana Pérez', '2026-11-02', 'XX']]));
    const p = planSync(null, next, app, new Map(), new Map(), DEFAULT_CODES);
    expect(p.unknownPeople).toEqual(['Carlos Nuevo']);
    expect([...p.unknownCodes]).toEqual([['XX', 1]]);
    expect(p.cells).toEqual([]);
  });

  it('la foto se guarda y se recupera igual', () => {
    const s = snapshotOf(excel([['Ana Pérez', '2026-11-02', 'V', 'nota']]));
    expect(deserializeSnapshot(JSON.parse(JSON.stringify(serializeSnapshot(s))))).toEqual(s);
  });
});

describe('aviso de OneDrive atascado', () => {
  const at = (s: string) => new Date(s);
  it('avisa en horario laboral si la copia lleva más de 2 h sin cambiar en la jornada', async () => {
    const { staleMinutes } = await import('./excelSync');
    expect(staleMinutes(at('2026-11-13T08:56:00'), at('2026-11-13T10:00:00'))).toBeNull();
    expect(staleMinutes(at('2026-11-13T08:56:00'), at('2026-11-13T11:30:00'))).toBe(154);
    // Lunes temprano: el Excel es del viernes, pero solo cuenta desde las 8:00
    expect(staleMinutes(at('2026-11-13T18:00:00'), at('2026-11-16T09:30:00'))).toBeNull();
    expect(staleMinutes(at('2026-11-13T18:00:00'), at('2026-11-16T10:30:00'))).toBe(150);
    // Fuera de horario y fines de semana no avisa
    expect(staleMinutes(at('2026-11-13T08:00:00'), at('2026-11-13T20:00:00'))).toBeNull();
    expect(staleMinutes(at('2026-11-13T08:00:00'), at('2026-11-14T12:00:00'))).toBeNull();
  });
});
