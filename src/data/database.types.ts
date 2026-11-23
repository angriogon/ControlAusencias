/*
 * Esquema de la base de datos de Supabase (generado con el generador de tipos de
 * Supabase el 20/11/2026 a partir del proyecto en producción). Si cambias tablas o
 * funciones en una migración, vuelve a generarlo y sustitúyelo.
 * Añadido a mano hasta regenerar: mark_export (migración 011).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      admin_config: {
        Row: { id: number; password_hash: string; updated_at: string; updated_by: string }
        Insert: { id?: number; password_hash: string; updated_at?: string; updated_by?: string }
        Update: { id?: number; password_hash?: string; updated_at?: string; updated_by?: string }
        Relationships: []
      }
      app_errors: {
        Row: {
          id: number; message: string; stack: string | null; ts: string; url: string | null
          user_agent: string | null; user_id: string | null; user_name: string | null; version: string | null
        }
        Insert: {
          id?: number; message: string; stack?: string | null; ts?: string; url?: string | null
          user_agent?: string | null; user_id?: string | null; user_name?: string | null; version?: string | null
        }
        Update: {
          id?: number; message?: string; stack?: string | null; ts?: string; url?: string | null
          user_agent?: string | null; user_id?: string | null; user_name?: string | null; version?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: { key: string; updated_at: string; updated_by: string; value: Json }
        Insert: { key: string; updated_at?: string; updated_by?: string; value: Json }
        Update: { key?: string; updated_at?: string; updated_by?: string; value?: Json }
        Relationships: []
      }
      change_log: {
        Row: {
          action: string; batch_id: string | null; batch_label: string | null; day: string | null
          employee_id: string | null; entity: string; id: number; new_value: Json | null; old_value: Json | null
          revert_of: number | null; reverted_by: number | null; ts: string; user_id: string | null; user_name: string
        }
        Insert: {
          action: string; batch_id?: string | null; batch_label?: string | null; day?: string | null
          employee_id?: string | null; entity: string; id?: number; new_value?: Json | null; old_value?: Json | null
          revert_of?: number | null; reverted_by?: number | null; ts?: string; user_id?: string | null; user_name: string
        }
        Update: {
          action?: string; batch_id?: string | null; batch_label?: string | null; day?: string | null
          employee_id?: string | null; entity?: string; id?: number; new_value?: Json | null; old_value?: Json | null
          revert_of?: number | null; reverted_by?: number | null; ts?: string; user_id?: string | null; user_name?: string
        }
        Relationships: []
      }
      codes: {
        Row: { activo: boolean; category: string; code: string; color: string; label: string; orden: number; text_color: string }
        Insert: { activo?: boolean; category?: string; code: string; color?: string; label: string; orden?: number; text_color?: string }
        Update: { activo?: boolean; category?: string; code?: string; color?: string; label?: string; orden?: number; text_color?: string }
        Relationships: []
      }
      employees: {
        Row: {
          activo: boolean; almacen: string; dias_lh: number; dias_vacaciones: number; equipo: string; extension: string
          guardias: string; id: string; nombre: string; notas: string; orden: number; sede: string; siglas: string | null
          team_leader: string; telefono: string; vp_pendientes: number; zona: string
        }
        Insert: {
          activo?: boolean; almacen?: string; dias_lh?: number; dias_vacaciones?: number; equipo?: string; extension?: string
          guardias?: string; id?: string; nombre: string; notas?: string; orden?: number; sede?: string; siglas?: string | null
          team_leader?: string; telefono?: string; vp_pendientes?: number; zona?: string
        }
        Update: {
          activo?: boolean; almacen?: string; dias_lh?: number; dias_vacaciones?: number; equipo?: string; extension?: string
          guardias?: string; id?: string; nombre?: string; notas?: string; orden?: number; sede?: string; siglas?: string | null
          team_leader?: string; telefono?: string; vp_pendientes?: number; zona?: string
        }
        Relationships: []
      }
      entries: {
        Row: { code: string; day: string; employee_id: string; updated_at: string; updated_by: string }
        Insert: { code: string; day: string; employee_id: string; updated_at?: string; updated_by?: string }
        Update: { code?: string; day?: string; employee_id?: string; updated_at?: string; updated_by?: string }
        Relationships: [
          { foreignKeyName: 'entries_code_fkey'; columns: ['code']; isOneToOne: false; referencedRelation: 'codes'; referencedColumns: ['code'] },
          { foreignKeyName: 'entries_employee_id_fkey'; columns: ['employee_id']; isOneToOne: false; referencedRelation: 'employees'; referencedColumns: ['id'] },
        ]
      }
      notes: {
        Row: { author: string; day: string; employee_id: string; text: string; updated_at: string }
        Insert: { author?: string; day: string; employee_id: string; text: string; updated_at?: string }
        Update: { author?: string; day?: string; employee_id?: string; text?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: 'notes_employee_id_fkey'; columns: ['employee_id']; isOneToOne: false; referencedRelation: 'employees'; referencedColumns: ['id'] },
        ]
      }
      profiles: {
        Row: {
          admin_failures: number; admin_locked_until: string | null; admin_until: string | null; created_at: string
          display_name: string; email: string; id: string; role: string
        }
        Insert: {
          admin_failures?: number; admin_locked_until?: string | null; admin_until?: string | null; created_at?: string
          display_name: string; email: string; id: string; role?: string
        }
        Update: {
          admin_failures?: number; admin_locked_until?: string | null; admin_until?: string | null; created_at?: string
          display_name?: string; email?: string; id?: string; role?: string
        }
        Relationships: []
      }
      snapshots: {
        Row: { auto: boolean; created_at: string; created_by: string; data: Json; employees_count: number; entries_count: number; id: number; label: string }
        Insert: { auto?: boolean; created_at?: string; created_by: string; data: Json; employees_count?: number; entries_count?: number; id?: number; label: string }
        Update: { auto?: boolean; created_at?: string; created_by?: string; data?: Json; employees_count?: number; entries_count?: number; id?: number; label?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      admin_lock: { Args: never; Returns: undefined }
      admin_status: { Args: never; Returns: Json }
      admin_unlock: { Args: { p_password: string }; Returns: string }
      apply_entries: { Args: { p_changes: Json; p_label: string }; Returns: string }
      apply_notes: { Args: { p_changes: Json; p_label: string }; Returns: string }
      create_snapshot: { Args: { p_auto?: boolean; p_label: string }; Returns: number }
      delete_employee: { Args: { p_id: string; p_label: string }; Returns: undefined }
      is_admin_mode: { Args: never; Returns: boolean }
      list_errors: {
        Args: { p_limit: number }
        Returns: {
          id: number; message: string; stack: string | null; ts: string; url: string | null
          user_agent: string | null; user_id: string | null; user_name: string | null; version: string | null
        }[]
        SetofOptions: { from: '*'; to: 'app_errors'; isOneToOne: false; isSetofReturn: true }
      }
      log_error: {
        Args: { p_message: string; p_stack: string; p_url: string; p_user_agent: string; p_version: string }
        Returns: undefined
      }
      mark_export: { Args: never; Returns: undefined }
      my_name: { Args: never; Returns: string }
      my_role: { Args: never; Returns: string }
      person_key: { Args: { p: string }; Returns: string }
      replace_all: { Args: { p_action: string; p_data: Json; p_label: string }; Returns: undefined }
      restore_snapshot: { Args: { p_id: number }; Returns: undefined }
      revert_batch: { Args: { p_batch: string; p_force: boolean }; Returns: undefined }
      revert_changes: { Args: { p_force: boolean; p_ids: number[] }; Returns: undefined }
      save_code: { Args: { p_code: Json; p_label: string }; Returns: undefined }
      save_employee: { Args: { p_emp: Json; p_label: string }; Returns: undefined }
      save_setting: { Args: { p_key: string; p_label: string; p_value: Json }; Returns: undefined }
      set_admin_password: { Args: { p_current: string; p_new: string }; Returns: undefined }
      set_user_role: { Args: { p_id: string; p_role: string }; Returns: undefined }
      sync_excel: { Args: { p_entries: Json; p_label: string; p_notes: Json }; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
