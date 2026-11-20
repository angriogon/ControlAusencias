import { describe, expect, it } from 'vitest';
import { EXPORT_EVERY_DAYS, exportDays } from './exportReminder';

describe('recordatorio de copia fuera de la app', () => {
  const now = new Date('2026-11-20T10:00:00Z').getTime();
  it('sin ninguna exportación, siempre toca avisar', () => {
    expect(exportDays(null, now)).toBe(Infinity);
  });
  it('cuenta los días desde la última exportación', () => {
    expect(exportDays('2026-11-12T10:00:00Z', now)).toBe(8);
    expect(exportDays('2026-11-12T10:00:00Z', now)).toBeGreaterThan(EXPORT_EVERY_DAYS);
    expect(exportDays('2026-11-19T10:00:00Z', now)).toBeLessThanOrEqual(EXPORT_EVERY_DAYS);
  });
});
