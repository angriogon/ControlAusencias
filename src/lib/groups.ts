import { DEFAULT_GROUPS, type Employee, type GroupsConfig, type PersonGroup } from '../types';
import { personKey } from './excelSync';

/** Lee el ajuste «grupos» guardado (o los grupos por defecto si no hay o está dañado). */
export function parseGroups(raw: unknown): GroupsConfig {
  const o = (raw ?? {}) as Partial<GroupsConfig>;
  const lista = Array.isArray(o.lista)
    ? o.lista.filter((g): g is PersonGroup => !!g && typeof g.id === 'string' && typeof g.nombre === 'string' && typeof g.color === 'string')
    : DEFAULT_GROUPS.lista;
  const personas = o.personas && typeof o.personas === 'object' ? o.personas : {};
  return { lista, personas };
}

/** Grupo de una persona (si su grupo se ha borrado, ninguno). */
export function groupOf(cfg: GroupsConfig, emp: Pick<Employee, 'nombre'>): PersonGroup | undefined {
  const id = cfg.personas[personKey(emp.nombre)];
  return id ? cfg.lista.find((g) => g.id === id) : undefined;
}

/** Asigna (o quita, con null) el grupo de una persona. */
export function setGroup(cfg: GroupsConfig, emp: Pick<Employee, 'nombre'>, groupId: string | null): GroupsConfig {
  const personas = { ...cfg.personas };
  const k = personKey(emp.nombre);
  if (groupId) personas[k] = groupId; else delete personas[k];
  return { ...cfg, personas };
}

/** Quita un grupo de la lista y de todas las personas que lo tenían. */
export function removeGroup(cfg: GroupsConfig, groupId: string): GroupsConfig {
  return {
    lista: cfg.lista.filter((g) => g.id !== groupId),
    personas: Object.fromEntries(Object.entries(cfg.personas).filter(([, g]) => g !== groupId)),
  };
}

/** Texto que se copia al hacer clic en el nombre: NOMBRE (en mayúsculas) y, debajo, el teléfono. */
export const contactText = (emp: Pick<Employee, 'nombre' | 'telefono'>) =>
  [emp.nombre.trim().toUpperCase(), emp.telefono?.trim()].filter(Boolean).join('\n');

/** Copia texto al portapapeles (con alternativa para navegadores sin permiso). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}
