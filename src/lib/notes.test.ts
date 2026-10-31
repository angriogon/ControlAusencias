import { describe, expect, it } from 'vitest';
import type { Employee, Entry, Note } from '../types';
import { agenda, classify, composeNote, findTime, frequentNotes, noteIcon, parseNote, pendingTasks, repeatDates, toggleDone } from './notes';

const emp = (id: string): Employee => ({ id, nombre: id.toUpperCase(), activo: true } as Employee);
const notes = (list: [string, string, string][]) => new Map<string, Note>(list.map(([id, date, text]) => [`${id}|${date}`, { employeeId: id, date, text, author: '' }]));

describe('notas con tipo', () => {
  it('compone y separa el prefijo', () => {
    const t = composeNote({ type: 'medico', time: '09:30', done: false, body: 'revisión' });
    expect(t).toBe('🩺 Médico 09:30 · revisión');
    expect(parseNote(t)).toEqual({ type: 'medico', time: '09:30', done: false, body: 'revisión' });
    expect(composeNote({ type: 'tarea', time: '', done: true, body: '' })).toBe('✅ 📌 Tarea');
    expect(parseNote('texto libre')).toEqual({ type: null, time: '', done: false, body: 'texto libre' });
  });

  it('clasifica notas antiguas por palabras clave y saca la hora', () => {
    expect(classify('MÉDICO 10:10')).toMatchObject({ type: 'medico', time: '10:10', explicit: false });
    expect(classify('TALLER 09:15 E ITV')).toMatchObject({ type: 'taller', time: '09:15' });
    expect(classify('ENTREGA FURGONETA NORTHGATE').type).toBe('taller');
    expect(classify('Médico 17:30h').time).toBe('17:30');
    expect(classify('POSIBLE CURSO ALTURA (PENDIENTE DE DEFINIR)').type).toBe('formacion');
    expect(classify('Despliegue TPVs DIA · Diamarket 1246 · 07:00')).toMatchObject({ type: 'otra', time: '07:00' });
    expect(findTime('a las 9h')).toBe('09:00');
    expect(classify('emo 2 pin pad hospitalet').type).toBe('otra');
  });

  it('iconos y marcar tareas como hechas', () => {
    expect(noteIcon('🩺 Médico 09:30')).toBe('🩺');
    expect(noteIcon('cita médica 15:00')).toBe('🩺');
    expect(noteIcon('Despliegue')).toBe('');
    const t = '📌 Tarea · llamar a Northgate';
    expect(toggleDone(t)).toBe('✅ 📌 Tarea · llamar a Northgate');
    expect(noteIcon(toggleDone(t))).toBe('✅');
    expect(toggleDone(toggleDone(t))).toBe(t);
  });

  it('agenda, cruce con PC y tareas pendientes', () => {
    const n = notes([['a', '2026-11-04', '🩺 Médico 09:30'], ['b', '2026-11-04', '📌 Tarea · pedir material'], ['b', '2026-10-01', '📌 Tarea · antigua'],
      ['b', '2026-09-01', 'llamar al cliente'], ['a', '2026-11-05', '✅ 📌 Tarea · hecha']]);
    const en = new Map<string, Entry>([['a|2026-11-04', { employeeId: 'a', date: '2026-11-04', code: 'PC' }]]);
    const ag = agenda([emp('a'), emp('b')], en, n, '2026-11-01', '2026-11-30');
    expect(ag.map((x) => [x.emp.id, x.info.type, x.clash])).toEqual([['a', 'medico', true], ['b', 'tarea', false], ['a', 'tarea', false]]);
    // La explícita antigua sigue pendiente; la deducida de septiembre no; la hecha tampoco
    expect(pendingTasks([emp('a'), emp('b')], en, n, '2026-11-02', '2026-11-30').map((x) => x.date)).toEqual(['2026-10-01', '2026-11-04']);
  });

  it('sugerencias de notas frecuentes, primero las de la persona', () => {
    const n = notes([['a', '2026-01-06', 'MÉDICO a las 11:00'], ['a', '2026-01-01', 'MÉDICO 9:30'], ['b', '2026-01-02', 'MÉDICO 10:00'], ['c', '2026-01-03', 'Taller'], ['c', '2026-01-04', 'Taller'], ['a', '2026-01-05', 'Entrega material']]);
    expect(frequentNotes(n, 'a').slice(0, 2)).toEqual(['MÉDICO', 'Entrega material']);
    expect(frequentNotes(n, null)).toContain('Taller');
  });

  it('fechas de tareas repetidas', () => {
    expect(repeatDates('2026-11-04', 'w', '2026-11-30')).toEqual(['2026-11-11', '2026-11-18', '2026-11-25']);
    expect(repeatDates('2026-11-04', '2w', '2026-12-02')).toEqual(['2026-11-18', '2026-12-02']);
    // 31 de enero → 28 de febrero (sábado) → lunes 2 de marzo
    expect(repeatDates('2026-01-30', 'm', '2026-03-31')).toEqual(['2026-03-02', '2026-03-30']);
  });
});
