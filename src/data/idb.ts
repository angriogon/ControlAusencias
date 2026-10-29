// Envoltorio mínimo de IndexedDB (clave/valor). localStorage se queda corto
// (5 MB) para guardar varias copias de seguridad completas.
const DB = 'control-ausencias';
const STORE = 'kv';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

export const idbGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key));
export const idbDel = (key: string) => run<void>('readwrite', (s) => s.delete(key));
