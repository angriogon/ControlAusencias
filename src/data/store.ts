import type {
  AppUser, CellChange, ChangeFilter, ChangeLog, Code, Dataset, Employee, LiveEvent, SnapshotInfo,
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

  // Escritura: cada llamada es UN lote en el historial (se deshace de una vez).
  /** Devuelve el id de lote, para poder deshacerlo desde el historial. */
  applyChanges(changes: CellChange[], label: string): Promise<string | null>;
  saveEmployee(e: Employee): Promise<Employee>;
  saveCode(c: Code): Promise<void>;
  /** Borrado definitivo de una persona y todas sus marcas (se puede revertir desde historial). */
  deleteEmployee(id: string): Promise<void>;

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
  /** Personas conectadas ahora mismo (si el backend lo soporta). */
  onPresence?(cb: (names: string[]) => void): () => void;
}
