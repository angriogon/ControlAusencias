import type { DataStore } from './store';
import { LocalStore } from './localStore';
import { SupabaseStore } from './supabaseStore';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Con VITE_SUPABASE_URL/KEY configurados: modo equipo. Si no: modo local (demo). */
export function createStore(): DataStore {
  if (url && key) return new SupabaseStore(url, key);
  return new LocalStore();
}
