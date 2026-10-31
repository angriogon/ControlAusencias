import type {
  AdminStatus, AppUser, UserProfile, CellChange, Note, NoteChange, PresenceUser, ChangeFilter, ChangeLog, Code, Dataset, Employee, LiveEvent, SnapshotInfo,
} from '../types';

/**
 * Contrato común de almacenamiento. La interfaz no sabe si los datos viven en
 * Supabase (modo equipo) o en el navegador (modo local/demo): así se puede
 * cambiar de backend (p. ej. a SharePoint/Graph) sin tocar las pantallas.
 */
export interface DataStore {
  readonly mode: 'local' | 'supabase';

  // Sesión
  currentUser(): Promise<AppUser | null>;
  signIn(email: string, password: string): Promise<AppUser>;
  signOut(): Promise<void>;
  resetPassword?(email: string): Promise<void>;

  // Lectura
  loadBase(): Promise<Pick<Dataset, 'employees' | 'codes'>>;
  loadEntries(from: string, to: string): Promise<Dataset['entries']>;
  loadNotes(from: string, to: string): Promise<Note[]>;

  // Escritura: cada llamada es UN lote en el historial (se deshace de una vez).
  /** Devuelve el id de lote, para poder deshacerlo desde el historial. */
  applyChanges(changes: CellChange[], label: string): Promise<string | null>;
  applyNotes(changes: NoteChange[], label: string): Promise<string | null>;
  saveEmployee(e: Employee): Promise<Employee>;
  saveCode(c: Code): Promise<void>;
  /** Borrado definitivo de una persona y todas sus marcas (se puede revertir desde historial). */
  deleteEmployee(id: string): Promise<void>;

  // Ajustes compartidos (zonas, equipos de campo…): clave → JSON
  loadSettings(): Promise<Record<string, unknown>>;
  /** Requiere modo administrador. */
  saveSetting(key: string, value: unknown, label: string): Promise<void>;

  // Usuarios y roles (solo rol admin)
  listProfiles(): Promise<UserProfile[]>;
  setUserRole(id: string, role: UserProfile['role']): Promise<void>;

  // Historial
  listChanges(f: ChangeFilter): Promise<ChangeLog[]>;
  /** force=false lanza ConflictError si alguien ha cambiado ese dato después. */
  revertChange(id: number, force: boolean): Promise<void>;
  revertBatch(batchId: string, force: boolean): Promise<void>;
  listUsers(): Promise<string[]>;

  // Copias de seguridad (puntos de restauración)
  listSnapshots(): Promise<SnapshotInfo[]>;
  createSnapshot(label: string): Promise<void>;
  getSnapshot(id: number): Promise<Dataset>;
  restoreSnapshot(id: number): Promise<void>;
  /** Sustituye TODO por los datos importados (antes guarda una copia automática). */
  importDataset(d: Dataset, label: string): Promise<void>;

  // Tiempo real
  subscribe(cb: (e: LiveEvent) => void): () => void;
  /** Compañeros conectados ahora mismo y en qué celda están. */
  onPresence?(cb: (users: PresenceUser[]) => void): () => void;
  /** Comunica en qué celda estoy (null = en ninguna). */
  setCursor?(cell: { employeeId: string; date: string } | null): void;

  // Modo administrador (contraseña compartida)
  adminStatus(): Promise<AdminStatus>;
  /** Devuelve la hora de caducidad o null si la contraseña es incorrecta. */
  adminUnlock(password: string): Promise<string | null>;
  adminLock(): Promise<void>;
  setAdminPassword(current: string | null, next: string): Promise<void>;
}
