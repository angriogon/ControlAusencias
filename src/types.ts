/** Una persona del equipo (fila del Excel). */
export interface Employee {
  id: string;
  nombre: string;
  telefono: string;
  extension: string;
  almacen: string;
  teamLeader: string;
  equipo: string;
  zona: string;
  guardias: string;
  sede: string;
  /** Días de vacaciones del año (en el Excel: el 25 de "=25-PV12"). */
  diasVacaciones: number;
  /** Vacaciones pendientes del año anterior (columna "VP"). */
  vpPendientes: number;
  /** Días de libre por horas disponibles (columna "Dias LH"). */
  diasLh: number;
  notas: string;
  orden: number;
  activo: boolean;
}

export type CodeCategory = 'ausencia' | 'control';

/** Una clave que se puede escribir en un día (V, B, FN, PC...). */
export interface Code {
  code: string;
  label: string;
  color: string;
  textColor: string;
  /** "ausencia" cuenta para el total de ausencias del día; "control" es solo informativa. */
  category: CodeCategory;
  orden: number;
  activo: boolean;
}

/** Una celda marcada: persona + día + clave. Un día vacío no tiene Entry. */
export interface Entry {
  employeeId: string;
  date: string; // YYYY-MM-DD
  code: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Nota de una celda (como las notas del Excel). Puede haber nota sin clave. */
export interface Note {
  employeeId: string;
  date: string;
  text: string;
  author: string;
  updatedAt?: string;
}

/** Cambio de nota: text null o vacío = borrar. */
export interface NoteChange {
  employeeId: string;
  date: string;
  text: string | null;
}

/** Cambio solicitado sobre una celda: code null = borrar. */
export interface CellChange {
  employeeId: string;
  date: string;
  code: string | null;
}

export type ChangeEntity = 'entry' | 'note' | 'employee' | 'code' | 'system';
export type ChangeAction = 'insert' | 'update' | 'delete' | 'restore' | 'import';

/** Registro del historial (quién cambió qué y cuándo). */
export interface ChangeLog {
  id: number;
  ts: string;
  userName: string;
  entity: ChangeEntity;
  action: ChangeAction;
  /** employeeId para entries/employees, code para codes. */
  employeeId: string | null;
  date: string | null;
  oldValue: unknown;
  newValue: unknown;
  batchId: string | null;
  batchLabel: string | null;
  revertedBy: number | null;
  revertOf: number | null;
}

export interface ChangeFilter {
  limit: number;
  beforeId?: number;
  userName?: string;
  employeeId?: string;
}

export interface SnapshotInfo {
  id: number;
  createdAt: string;
  label: string;
  createdBy: string;
  auto: boolean;
  employees: number;
  entries: number;
}

export interface Dataset {
  employees: Employee[];
  codes: Code[];
  entries: Entry[];
  /** Opcional: las copias antiguas no tienen notas. */
  notes?: Note[];
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'lector';
}

/** Evento en tiempo real (cambios hechos por otros usuarios u otras pestañas). */
export type LiveEvent =
  | { type: 'entry'; entry: Entry | null; employeeId: string; date: string }
  | { type: 'note'; note: Note | null; employeeId: string; date: string }
  | { type: 'employee'; employee: Employee | null; id: string }
  | { type: 'code'; code: Code | null; key: string }
  | { type: 'reload' };

/** Compañero conectado y la celda en la que está (si está en el calendario). */
export interface PresenceUser {
  key: string;
  name: string;
  color: string;
  cell: { employeeId: string; date: string } | null;
}

export interface AdminStatus {
  /** ¿Existe ya una contraseña de administrador? */
  configured: boolean;
  /** Hasta cuándo está activo el modo admin para mí (ISO), o null. */
  until: string | null;
  /** ¿Puedo crear/cambiar la contraseña? (rol admin en Supabase) */
  canManage: boolean;
}

/** Claves que nunca se pisan en cambios de varias celdas o periodos. */
export const PROTECTED_CODES = ['FN', 'FL', 'F'];
/** A partir de cuántas personas un cambio se considera masivo (requiere modo admin). */
export const MASS_PEOPLE_LIMIT = 5;

export class AdminRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminRequiredError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
