import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseWorkbook } from './excelImport';

// Prueba con el Excel real solo si se indica su ruta (nunca se sube al repo):
//   XLSX_PATH=/ruta/al/archivo.xlsm npm test
const path = process.env.XLSX_PATH;

describe.runIf(path && existsSync(path))('importación del Excel real', () => {
  it('lee personas, fechas y marcas', () => {
    const r = parseWorkbook(readFileSync(path!));
    console.log(JSON.stringify({ stats: r.stats, warnings: r.warnings }, null, 2));
    console.log(r.dataset.employees.slice(0, 3).map((e) => `${e.nombre} | ${e.equipo} | ${e.zona} | ${e.sede} | vac ${e.diasVacaciones}`).join('\n'));
    expect(r.stats.employees).toBeGreaterThan(50);
    expect(r.stats.entries).toBeGreaterThan(1000);
  });
});
