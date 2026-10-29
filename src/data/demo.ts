import type { Dataset, Employee, Entry } from '../types';
import { DEFAULT_CODES } from '../lib/codes';
import { addDays, isWeekend, iso } from '../lib/dates';

/**
 * Datos de ejemplo 100% ficticios para probar la app en modo local.
 * (Los datos reales se cargan con "Importar Excel"; nunca se guardan en el repositorio.)
 */
const PEOPLE: [string, string, string, string][] = [
  ['Lucía Martín Ortega', 'DISPATCH', 'Sev', 'Coord. DISPATCHER SEV'],
  ['Pablo Navarro Gil', 'DISPATCH', 'Sev', 'DISPATCHER 1 SEV'],
  ['Marta Iglesias Rubio', 'DISPATCH', 'Sev', 'DISPATCHER 2 SEV'],
  ['Sergio Domínguez Vela', 'ALMACEN', 'Sev', 'ALMACEN SEV'],
  ['Elena Castro Prieto', 'ALMACEN', 'Sev', 'ALMACEN SEV'],
  ['Javier Molina Santos', 'TEC.P', 'Occ', 'Huelva'],
  ['Raúl Ortiz Campos', 'TEC.P', 'Occ', 'Cádiz'],
  ['Nuria Vidal Herrera', 'TEC.P', 'Ori', 'Málaga'],
  ['Andrés Cano Fuentes', 'TEC.P', 'Ori', 'Granada'],
  ['Irene Soler Méndez', 'TEC.P', 'Cen', 'Madrid'],
  ['Diego Pascual León', 'TEC.P', 'Cen', 'Madrid'],
  ['Carmen Rey Lozano', 'TEC.P.EX', 'Cen', 'Madrid'],
  ['Hugo Benítez Mora', 'TEC.P', 'Lev', 'Valencia'],
  ['Sara Carmona Pardo', 'TEC.P', 'Lev', 'Valencia'],
  ['Óscar Gallego Ramos', 'COLAB', 'Mur', 'Murcia'],
  ['Laura Vicente Peña', 'TEC.P', 'Cat', 'Barcelona'],
  ['Adrián Marín Soto', 'TEC.P', 'Cat', 'Girona'],
  ['Alba Herrero Cruz', 'TEC.P', 'Nor', 'Santander'],
  ['Iván Crespo Nieto', 'TEC.P', 'Lpa', 'Las Palmas'],
  ['Paula Esteban Rojas', 'TEC.P', 'Ten', 'Tenerife'],
];
const LEADERS: Record<string, string> = { Occ: 'ABDUL', Ori: 'ABDUL', Cen: 'ADGG', Lev: 'OLTRA', Mur: 'OLTRA', Cat: 'MARC', Nor: 'MARC', Lpa: 'JONAS', Ten: 'JONAS' };

export function demoDataset(year: number): Dataset {
  const employees: Employee[] = PEOPLE.map(([nombre, equipo, zona, sede], i) => ({
    id: crypto.randomUUID(),
    nombre,
    telefono: `600 000 ${String(100 + i).padStart(3, '0')}`,
    extension: String(58100 + i),
    almacen: equipo === 'TEC.P' ? `O${zona.toUpperCase().slice(0, 2)}${(i % 5) + 1}` : '',
    teamLeader: LEADERS[zona] ?? '',
    equipo,
    zona,
    guardias: 'NO',
    sede,
    diasVacaciones: 25,
    vpPendientes: i % 4 === 0 ? 3 : 0,
    diasLh: 0,
    notas: '',
    orden: i,
    activo: true,
  }));

  const entries: Entry[] = [];
  const put = (e: Employee, date: string, code: string) => entries.push({ employeeId: e.id, date, code });
  const fixed = ['01-01', '01-06', '04-03', '05-01', '08-15', '10-12', '11-01', '12-08', '12-25'];

  employees.forEach((e, i) => {
    // Festivos nacionales
    fixed.forEach((md) => put(e, `${year}-${md}`, 'FN'));
    // Un bloque de vacaciones en verano y otro en otoño (días laborables)
    const start = iso(year, 6 + (i % 2), 1 + ((i * 3) % 20));
    for (let k = 0, d = start; k < 10; d = addDays(d, 1)) {
      if (!isWeekend(d)) { put(e, d, 'V'); k++; }
    }
    const autumn = iso(year, 9, 5 + (i % 15));
    for (let k = 0, d = autumn; k < 3; d = addDays(d, 1)) {
      if (!isWeekend(d)) { put(e, d, 'V'); k++; }
    }
    // Algo de variedad: presencial en cliente, bajas, formación, sábados trabajados
    if (e.equipo === 'TEC.P') {
      for (let w = 0; w < 52; w += 3) {
        const d = addDays(`${year}-01-05`, w * 7 + (i % 5));
        if (!entries.some((x) => x.employeeId === e.id && x.date === d)) put(e, d, 'PC');
      }
    }
    if (i % 6 === 0) ['10-20', '10-21', '10-22'].forEach((md) => put(e, `${year}-${md}`, 'B'));
    if (i % 5 === 1) put(e, `${year}-10-27`, 'F');
    if (i % 4 === 2) put(e, addDays(`${year}-10-03`, 7 * (i % 3)), 'TS');
  });

  // Quitar duplicados (gana el último)
  const uniq = new Map(entries.map((x) => [`${x.employeeId}|${x.date}`, x]));
  return { employees, codes: DEFAULT_CODES, entries: [...uniq.values()] };
}
