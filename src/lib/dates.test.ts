import { describe, expect, it } from 'vitest';
import { addDays, dateRange, isWeekend, isoWeek, monthDays, weekday } from './dates';

describe('fechas', () => {
  it('calcula días de la semana sin depender de la zona horaria', () => {
    expect(weekday('2026-10-29')).toBe(4); // jueves
    expect(isWeekend('2026-10-31')).toBe(true);
    expect(isWeekend('2026-10-30')).toBe(false);
  });
  it('genera meses y rangos', () => {
    expect(monthDays(2028, 1)).toHaveLength(29); // bisiesto
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(dateRange('2026-01-03', '2026-01-01')).toHaveLength(3);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('numera semanas ISO', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
  });
});
