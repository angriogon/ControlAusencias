import type { Code, Dataset } from '../types';
import { MONTHS_SHORT, WEEKDAY_LETTER, dateRange, isWeekend, parseIso, weekday } from './dates';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase().padStart(6, '0')}`;

/**
 * Exporta a Excel con el mismo aspecto que la hoja original (personas en filas,
 * días en columnas, colores por clave) + una hoja de resumen y la leyenda.
 * ExcelJS se carga solo al exportar para no ralentizar el arranque de la app.
 */
export async function exportToExcel(d: Dataset, from: string, to: string, fileName: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control de Ausencias';
  const codes = new Map<string, Code>(d.codes.map((c) => [c.code, c]));
  const days = dateRange(from, to);
  const emps = [...d.employees].filter((e) => e.activo).sort((a, b) => a.orden - b.orden);
  const byKey = new Map(d.entries.map((e) => [`${e.employeeId}|${e.date}`, e.code]));

  // ---------- Hoja calendario ----------
  const ws = wb.addWorksheet('Ausencias', { views: [{ state: 'frozen', xSplit: 5, ySplit: 3 }] });
  const info = ['Nombre', 'Equipo', 'Zona', 'Sede', 'Team Leader'];
  const r1 = ws.getRow(1);
  const r2 = ws.getRow(2);
  const r3 = ws.getRow(3);
  info.forEach((h, i) => { r3.getCell(i + 1).value = h; });
  days.forEach((day, i) => {
    const col = info.length + 1 + i;
    const { m0, d: dd, y } = parseIso(day);
    if (dd === 1 || i === 0) r1.getCell(col).value = `${MONTHS_SHORT[m0]} ${y}`;
    r2.getCell(col).value = WEEKDAY_LETTER[weekday(day)];
    r3.getCell(col).value = dd;
    ws.getColumn(col).width = 4.2;
    if (isWeekend(day)) {
      [r2, r3].forEach((r) => { r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }; });
    }
  });
  [r1, r2, r3].forEach((r) => { r.font = { bold: true }; r.alignment = { horizontal: 'center' }; });
  ws.getColumn(1).width = 34;
  [2, 3, 4, 5].forEach((c) => { ws.getColumn(c).width = 14; });

  emps.forEach((e, idx) => {
    const row = ws.getRow(4 + idx);
    [e.nombre, e.equipo, e.zona, e.sede, e.teamLeader].forEach((v, i) => { row.getCell(i + 1).value = v; });
    days.forEach((day, i) => {
      const code = byKey.get(`${e.id}|${day}`);
      if (!code) return;
      const cell = row.getCell(info.length + 1 + i);
      cell.value = code;
      const c = codes.get(code);
      if (c) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.color) } };
        cell.font = { color: { argb: argb(c.textColor) }, size: 9 };
      }
      cell.alignment = { horizontal: 'center' };
    });
  });

  // ---------- Hoja resumen por persona ----------
  const sum = wb.addWorksheet('Resumen');
  const ordered = [...d.codes].sort((a, b) => a.orden - b.orden);
  sum.addRow(['Nombre', 'Equipo', 'Zona', ...ordered.map((c) => c.code), 'Vacaciones año', 'Vacaciones pendientes']).font = { bold: true };
  emps.forEach((e) => {
    const counts = new Map<string, number>();
    days.forEach((day) => {
      const code = byKey.get(`${e.id}|${day}`);
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    });
    sum.addRow([e.nombre, e.equipo, e.zona, ...ordered.map((c) => counts.get(c.code) ?? 0), e.diasVacaciones, e.diasVacaciones - (counts.get('V') ?? 0)]);
  });
  sum.getColumn(1).width = 34;

  // ---------- Leyenda ----------
  const leg = wb.addWorksheet('Leyenda');
  leg.addRow(['Clave', 'Significado', 'Tipo']).font = { bold: true };
  ordered.forEach((c) => {
    const row = leg.addRow([c.code, c.label, c.category === 'ausencia' ? 'Ausencia' : 'Control']);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.color) } };
    row.getCell(1).font = { color: { argb: argb(c.textColor) }, bold: true };
  });
  leg.getColumn(2).width = 50;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
