import type { Code, Employee, Entry, Note, OpsConfig } from '../types';
import { MONTHS, WEEKDAY_LETTER, dateRange, formatDate, isWeekend, parseIso, weekday } from './dates';
import { absenceSet, balances, fieldStaff, pcLoad, pcWeight, zoneDay, zonesOf } from './ops';

const LEVEL_FILL: Record<string, string> = { ok: 'FFD5F0DD', justo: 'FFFFE9A8', bajo: 'FFF8C4BE', festivo: 'FFE4E7EC' };

/**
 * Informe mensual para el responsable (Excel): resumen por zona, cobertura día
 * a día, detalle por persona y saldos del año. ExcelJS se carga solo aquí.
 */
export async function exportOpsReport(
  employees: Employee[], codes: Code[], entries: Map<string, Entry>, notes: Map<string, Note>, cfg: OpsConfig, y: number, m0: number,
) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control de Ausencias';
  const mm = String(m0 + 1).padStart(2, '0');
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const from = `${y}-${mm}-01`;
  const to = `${y}-${mm}-${last}`;
  const work = dateRange(from, to).filter((d) => !isWeekend(d));
  const staff = fieldStaff(employees, cfg);
  const zones = zonesOf(staff);
  const absence = absenceSet(codes);
  const absCodes = codes.filter((c) => c.category === 'ausencia').sort((a, b) => a.orden - b.orden);
  const load = pcLoad(staff, entries, from, to);
  const title = `${MONTHS[m0]} ${y}`;
  const bold = { bold: true };

  // ---------- Zonas ----------
  const zs = wb.addWorksheet('Zonas', { views: [{ state: 'frozen', ySplit: 3 }] });
  zs.addRow([`Informe de operativa · ${title}`]).font = { bold: true, size: 14 };
  zs.addRow([`${work.length} días laborables · técnicos de campo: ${cfg.equipos.join(', ')}`]);
  const head = ['Zona', 'Técnicos', 'Mínimo', 'Días ausencia', '% absentismo', ...absCodes.map((c) => c.code), 'Días PC', 'Días sin cubrir', 'Días justos'];
  zs.addRow(head).font = bold;
  let tot = { tec: 0, abs: 0, pc: 0, red: 0, amber: 0 };
  const totByCode = new Map<string, number>();
  for (const z of zones) {
    const people = staff.filter((e) => (e.zona || '(sin zona)') === z);
    const byCode = new Map<string, number>();
    let abs = 0; let pc = 0; let red = 0; let amber = 0;
    for (const d of work) {
      for (const e of people) {
        const code = entries.get(`${e.id}|${d}`)?.code;
        if (code && absence.has(code)) { abs++; byCode.set(code, (byCode.get(code) ?? 0) + 1); }
      }
      const zd = zoneDay(z, d, staff, entries, notes, absence, cfg);
      if (zd.level === 'bajo') red++;
      if (zd.level === 'justo') amber++;
    }
    for (const e of people) pc += load.get(e.id) ?? 0;
    const pct = people.length && work.length ? abs / (people.length * work.length) : 0;
    const row = zs.addRow([z, people.length, Math.min(cfg.zonas[z]?.minimo ?? 1, people.length), abs, pct, ...absCodes.map((c) => byCode.get(c.code) ?? 0), pc, red, amber]);
    row.getCell(5).numFmt = '0.0%';
    if (red) row.getCell(head.length - 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEVEL_FILL.bajo } };
    tot = { tec: tot.tec + people.length, abs: tot.abs + abs, pc: tot.pc + pc, red: tot.red + red, amber: tot.amber + amber };
    byCode.forEach((n, c) => totByCode.set(c, (totByCode.get(c) ?? 0) + n));
  }
  const tr = zs.addRow(['TOTAL', tot.tec, '', tot.abs, tot.tec && work.length ? tot.abs / (tot.tec * work.length) : 0, ...absCodes.map((c) => totByCode.get(c.code) ?? 0), tot.pc, tot.red, tot.amber]);
  tr.font = bold;
  tr.getCell(5).numFmt = '0.0%';
  zs.getColumn(1).width = 16;
  for (let i = 2; i <= head.length; i++) zs.getColumn(i).width = 11;

  // ---------- Cobertura día a día ----------
  const cs = wb.addWorksheet('Cobertura', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  cs.addRow(['Zona', ...work.map((d) => WEEKDAY_LETTER[weekday(d)])]).font = bold;
  cs.addRow(['', ...work.map((d) => parseIso(d).d)]).font = bold;
  for (const z of zones) {
    const row = cs.addRow([z]);
    work.forEach((d, i) => {
      const zd = zoneDay(z, d, staff, entries, notes, absence, cfg);
      const cell = row.getCell(i + 2);
      cell.value = zd.level === 'festivo' ? 'F' : `${zd.working}/${zd.total}`;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEVEL_FILL[zd.level] } };
      cell.alignment = { horizontal: 'center' };
      if (zd.fuera.length) cell.note = zd.fuera.map((f) => `${f.emp.nombre}: ${f.code}`).join('\n');
    });
  }
  cs.addRow([]);
  cs.addRow(['Verde: cubierta · Amarillo: justa (en el mínimo) · Rojo: sin cubrir · Gris: festivo. Celda = trabajando / total.']);
  cs.getColumn(1).width = 16;
  for (let i = 2; i <= work.length + 1; i++) cs.getColumn(i).width = 5.5;

  // ---------- Personas ----------
  const ps = wb.addWorksheet('Personas', { views: [{ state: 'frozen', ySplit: 1 }] });
  const used = codes.filter((c) => [...entries.values()].some((e) => e.code === c.code && e.date >= from && e.date <= to)).sort((a, b) => a.orden - b.orden);
  ps.addRow(['Nombre', 'Siglas', 'Equipo', 'Zona', ...used.map((c) => c.code), 'Días PC']).font = bold;
  for (const e of employees.filter((x) => x.activo).sort((a, b) => a.orden - b.orden)) {
    const counts = new Map<string, number>();
    let pc = 0;
    for (const d of dateRange(from, to)) {
      const code = entries.get(`${e.id}|${d}`)?.code;
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
      pc += pcWeight(code);
    }
    ps.addRow([e.nombre, e.siglas, e.equipo, e.zona, ...used.map((c) => counts.get(c.code) ?? ''), pc || '']);
  }
  ps.getColumn(1).width = 36;
  ps.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: used.length + 5 } };

  // ---------- Saldos del año ----------
  const ss = wb.addWorksheet('Saldos año', { views: [{ state: 'frozen', ySplit: 1 }] });
  ss.addRow(['Nombre', 'Equipo', 'Zona', 'Vacaciones año', 'Vac. pendientes', 'VP pendientes', 'TF+TS trabajados', 'Lf+Lh libres', 'Bajas (B)', 'Días PC']).font = bold;
  for (const b of balances(employees.filter((x) => x.activo), entries, y).sort((a, z) => z.vacLeft - a.vacLeft)) {
    const row = ss.addRow([b.emp.nombre, b.emp.equipo, b.emp.zona, b.vac, b.vacLeft, b.emp.vpPendientes ? b.vpLeft : '', b.worked, b.compensated, b.bajas, b.pc]);
    if (b.vacLeft >= 10) row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEVEL_FILL.justo } };
  }
  ss.getColumn(1).width = 36;
  ss.addRow([]);
  ss.addRow([`Saldos a ${formatDate(new Date().toISOString().slice(0, 10))} con los datos del año ${y}.`]);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Informe operativa ${y}-${mm}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
