import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { conflictKey, extractVisits, planChanges, readPlanning, toIsoDate, toTime, withSubstitutes, type PlanVisit } from './planningImport';
import type { Employee, Entry, Note } from '../types';

const emp = (id: string, nombre: string, siglas: string) => ({ id, nombre, siglas } as Employee);

describe('planificación: conversiones', () => {
  it('fechas y horas de Excel', () => {
    expect(toIsoDate('46331')).toBe('2026-11-05');
    expect(toIsoDate('05/11/2026')).toBe('2026-11-05');
    expect(toTime('0.2916666666666667')).toBe('07:00');
    expect(toTime('0.2708333333333333')).toBe('06:30');
    expect(toTime('7:00')).toBe('07:00');
  });
});

describe('planificación: sustitutos', () => {
  it('el sustituto recibe PC y la nota con «sustituye a»', () => {
    const people = [emp('a', 'ANA', 'AAA'), emp('b', 'BEA', 'BBB')];
    const visits: PlanVisit[] = [{ row: 2, date: '2026-11-05', time: '07:00', siglas: ['AAA'], place: 'Tienda 1' }];
    const entries = new Map<string, Entry>([['a|2026-11-05', { employeeId: 'a', date: '2026-11-05', code: 'V' }]]);
    const r = planChanges(visits, 'Despliegue', people, entries, new Map());
    expect(r.conflicts).toHaveLength(1);
    const s = withSubstitutes(r, new Map([[conflictKey(r.conflicts[0]), people[1]]]), entries, new Map());
    expect(s.codes).toEqual([{ employeeId: 'b', date: '2026-11-05', code: 'PC' }]);
    expect(s.notes[0].text).toBe('Despliegue · Tienda 1 · 07:00 · sustituye a AAA');
    expect(s.items[0].replaces?.id).toBe('a');
    // Si el sustituto tiene otra clave ese día, no se toca
    const busy = new Map(entries).set('b|2026-11-05', { employeeId: 'b', date: '2026-11-05', code: 'B' });
    expect(withSubstitutes(r, new Map([[conflictKey(r.conflicts[0]), people[1]]]), busy, new Map()).codes).toHaveLength(0);
  });
});

const path = process.env.PLAN_PATH;
describe.runIf(path && existsSync(path))('planificación real', () => {
  it('marca PC + nota, avisa de otras claves y no duplica', () => {
    const { best, guess } = readPlanning(readFileSync(path!));
    expect(best?.name).toBe('Hoja1');
    const visits = extractVisits(best!, guess!);
    console.log('columnas', guess, '\n', visits.slice(0, 2));
    const people = [emp('a', 'ALBERTO HERVÁS CASABÁN', 'AHC'), emp('e', 'EMILIO PALACIOS CEBOLLA', 'EMPC')];
    const entries = new Map<string, Entry>([
      ['e|2026-11-03', { employeeId: 'e', date: '2026-11-03', code: 'V' }],   // otra clave → aviso
      ['e|2026-11-10', { employeeId: 'e', date: '2026-11-10', code: 'PC' }],  // ya PC → solo nota
    ]);
    const r = planChanges(visits, 'Despliegue TPVs DIA', people, entries, new Map<string, Note>());
    console.log({ visitas: r.visits, codigos: r.codes.length, notas: r.notes.length, conflictos: r.conflicts.map((c) => `${c.emp.siglas} ${c.date} ${c.code}`), desconocidas: [...r.unknownSiglas] });
    console.log('nota ejemplo:', r.notes[0]?.text);
    expect(r.visits).toBe(15);
    expect(r.unknownSiglas.get('FMNT')).toBe(7);
    expect(r.conflicts).toHaveLength(1);
    expect(r.codes.find((c) => c.date === '2026-11-10')).toBeUndefined();
    expect(r.notes.find((c) => c.date === '2026-11-10')).toBeDefined();
    // Volver a importar lo mismo no duplica nada
    const after = new Map(entries);
    r.codes.forEach((c) => after.set(`${c.employeeId}|${c.date}`, { employeeId: c.employeeId, date: c.date, code: 'PC' }));
    const notesAfter = new Map(r.notes.map((n) => [`${n.employeeId}|${n.date}`, { employeeId: n.employeeId, date: n.date, text: n.text!, author: '' }]));
    const again = planChanges(visits, 'Despliegue TPVs DIA', people, after, notesAfter);
    expect(again.codes.length + again.notes.length).toBe(0);
    expect(again.alreadyDone).toBe(r.items.length);
  });
});
