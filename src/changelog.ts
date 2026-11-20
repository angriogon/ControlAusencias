/**
 * Histórico de versiones: la fuente única. La primera es la versión actual
 * (debe coincidir con "version" de package.json: lo comprueba una prueba).
 *
 * Cómo numerar (MAYOR.MENOR.ARREGLO):
 *  - MENOR (1.8.0 → 1.9.0): funciones nuevas que se notan al usar la app.
 *  - ARREGLO (1.8.0 → 1.8.1): correcciones y retoques pequeños.
 *  - MAYOR (1.x → 2.0.0): cambios de fondo en la forma de trabajar.
 * Cada fusión a main que cambie algo visible añade su versión aquí arriba.
 * Frases cortas, en lenguaje de usuario (qué cambia para quien la usa).
 */
export interface Release {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.11.0',
    date: '2026-11-20',
    title: 'Seguridad y orden',
    changes: [
      'Las cuentas nuevas empiezan en «solo consulta»: el administrador les da permiso de edición en Ajustes → Usuarios.',
      'El navegador solo ejecuta código de la propia app y solo se conecta a nuestro servidor.',
      'Recordatorio semanal al administrador para guardar una copia en Excel fuera de la app.',
      'La sesión se cierra sola tras 8 h sin uso también en el PC (salvo el que sincroniza el Excel).',
      'Calendario: «Team leader» y «Agrupar» pasan al botón «⋯ Más»; la cabecera cabe en una fila también a 1280 px.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-11-20',
    title: 'Más rápida y más segura',
    changes: [
      'Arranca antes: cada sección se descarga al abrirla (y las demás, en segundo plano).',
      'Si una pantalla falla, sale un aviso con «Recargar» en vez de quedarse en blanco.',
      'Los fallos quedan anotados para el administrador en Ajustes → Errores.',
      'Tras publicar una versión nueva, la app se recarga sola si lo necesita.',
      'Pruebas automáticas de las pantallas antes de cada publicación.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-11-20',
    title: 'Pantallas más limpias',
    changes: [
      '4 pestañas: Calendario · Operativa · Historial y copias · Ajustes.',
      'Barra superior en una línea; tu nombre abre un menú con Novedades, Guía y Cerrar sesión.',
      'Calendario: filtros y botones en una sola fila; la tabla empieza más arriba.',
      'Operativa en 4 apartados: Centro de mando, Agenda, Cobertura (con ¿Quién puede ir?) y Cifras (saldos, carga y resumen del año).',
      '«Revisar datos» pasa a Ajustes; la explicación de la sincronización se pliega cuando ya está activa.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-11-20',
    title: 'Limpieza y retoques',
    changes: [
      'Resumen: los títulos de las columnas numéricas quedan alineados con sus cifras.',
      'Código más limpio por dentro (sin cambios en el uso).',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-11-20',
    title: 'Versiones y novedades',
    changes: [
      'Número de versión junto al nombre de la app: al pulsarlo se ven las novedades.',
      'Tras cada actualización, un aviso con lo nuevo.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-11-20',
    title: 'Retoques en grupos',
    changes: [
      'Los grupos van dentro de la leyenda y se ocultan con ella.',
      'Filtro «Sin grupo» para ver a quien aún no tiene grupo.',
      'Ajustes → Grupos: el botón «Guardar grupos» queda fijo abajo.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-11-18',
    title: 'Siglas protegidas y grupos de personal',
    changes: [
      'Las siglas no se pierden al importar el Excel ni al restaurar copias; cambiarlas pide confirmación.',
      'Grupos de personal con color (UNEI, INPLANT, colaboradores, subcontratas…) en Ajustes → Grupos.',
      'Clic en un nombre: copia «NOMBRE» y el teléfono. Su mes entero se selecciona con ▦.',
      'La columna Siglas se ajusta a las siglas más largas.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-11-13',
    title: 'Sincronización con el Excel de SharePoint',
    changes: [
      'La app lee el Excel (vía OneDrive) cada 20 s y aplica lo que cambie. Nunca escribe en él.',
      '«Comprobar ahora» siempre informa del resultado.',
      'Aviso si OneDrive parece atascado (más de 2 h sin cambios en horario laboral).',
      '«Revisar diferencias con el Excel»: comparación completa, también de borrados.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-31',
    title: 'Agenda, tareas y notas con tipo',
    changes: [
      'Notas con tipo e icono: 🩺 Médico, 🚐 Taller/ITV, 📌 Tarea, 🎓 Formación.',
      'Tareas pendientes y repetidas (cada semana o mes); motivo al marcar P o A.',
      'Textos sugeridos y buscador de notas.',
      'Pruebas automáticas antes de cada publicación.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-31',
    title: 'Operativa para dispatch',
    changes: [
      'Centro de mando, cobertura por zona y aviso de mínimos.',
      '«¿Quién puede ir?», carga de PC, saldos, revisión de datos e informe mensual.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-30',
    title: 'Siglas e importar planificación',
    changes: [
      'Siglas de cada persona y nombres completos en el calendario.',
      'Importar planificación: marca PC con nota «motivo · lugar · hora» y avisa de conflictos.',
      'Supr borra clave y nota.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-29',
    title: 'Vista móvil',
    changes: [
      'Pantallas para el móvil: Hoy, Personas, ficha y edición de un día.',
      'Sesión que se cierra sola tras 8 h sin uso.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-29',
    title: 'Trabajo en equipo',
    changes: [
      'Se ve en tiempo real en qué celda está cada compañero.',
      'Selección de filas y columnas, paleta de claves nueva.',
      'FN, FL y F protegidas en cambios masivos; modo administrador.',
      'Arreglo: la app ya no se recarga entera cada 30 s.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-29',
    title: 'Primera versión',
    changes: [
      'Calendario de ausencias compartido que sustituye al Excel.',
      'Historial de cambios, deshacer y copias de seguridad diarias.',
      'Notas por celda, importadas de las notas del Excel.',
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
