# Control de Ausencias · guía para Claude

PWA que sustituye al Excel «Control Ausencias presencial» (SharePoint) del equipo de dispatch/técnicos de campo de Tier1. La usa y desarrolla **AMRG** (Ángel Manuel Ríos, Dispatcher IT). Lee también `README.md` (funciones) y `docs/PUESTA_EN_MARCHA.md` (lista de puesta en marcha).

## Cómo trabajar con el usuario

- **Español de España**, directo, honesto y crítico; explica el porqué. No inventes datos (horarios, cifras, nombres): si no está confirmado, dilo.
- Respeta exactamente nombres, siglas, claves y fechas que dé el usuario.
- **Flujo de cambios**: rama `claude/<tema>` → probar → PR a `main` → **fusionar solo cuando el usuario diga «Fusiona»** (salvo que lo autorice expresamente en esa petición). Tras fusionar, comprobar que el workflow «Publicar en GitHub Pages» termina en verde y avisar de recargar con Ctrl+F5.
- **Versiones**: cada fusión que cambie algo visible sube la versión. Añade la entrada arriba en `src/changelog.ts` (frases cortas, para el usuario) y pon el mismo número en `package.json` y `package-lock.json` (una prueba lo comprueba). MENOR (1.8 → 1.9) = funciones nuevas; ARREGLO (1.8.0 → 1.8.1) = correcciones y retoques. Cambios solo internos (docs, CI) no suben versión. La app muestra la versión junto al nombre y avisa de las novedades al actualizarse.
- Para propuestas grandes: analiza, propone con prioridades y pregunta antes de implementar.
- No elimines funcionalidades al añadir otras. Prioriza UX simple: la app la usan personas no técnicas.
- Datos reales (Excel, planificaciones) **nunca** al repositorio (`.gitignore` bloquea `*.xlsx/*.xlsm`). Capturas para documentos: con datos ficticios (modo local).

## Stack y comandos

- React 19 + TypeScript 7 + Vite 8 + vite-plugin-pwa. Node 22.
- `npm ci` · `npx tsc -b` (tipos) · `npm test` (vitest) · `npm run build`.
- Modo local (demo, sin servidor): `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir /tmp/dist-local` y `npx vite preview --outDir /tmp/dist-local --port 4180`. Sirve para probar con Playwright (`require('playwright')`), importando el Excel real desde «Historial y copias → Excel».
- `.env.local` (no versionado): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del proyecto Supabase (la clave anon es pública por diseño; la seguridad está en RLS y en las funciones).
- CI: `.github/workflows/pruebas.yml` (cada PR: tipos, pruebas, build) y `deploy.yml` (push a `main`: pruebas + build + GitHub Pages en `https://angriogon.github.io/ControlAusencias/`; usa las Variables `VITE_SUPABASE_URL/ANON_KEY` del repo).

## Arquitectura

- `src/data/store.ts`: interfaz `DataStore`. Implementaciones `supabaseStore.ts` (modo equipo) y `localStore.ts` (IndexedDB, demo). La interfaz no sabe qué backend hay.
- `src/data/useAppData.ts`: estado central, guardado optimista, deshacer (Ctrl+Z) por lotes, ajustes compartidos (`ops`).
- `src/data/useExcelSync.ts` + `src/lib/excelSync.ts`: **sincronización Excel → app** (un solo sentido; la app nunca escribe en el Excel). El navegador del admin vigila el Excel sincronizado con OneDrive (File System Access API, Edge/Chrome) cada 20 s; aplica solo lo que cambia respecto a la última «foto» (gana el Excel); «Revisar diferencias» hace la comparación completa con borrados. Aviso de OneDrive atascado (>2 h sin cambios en horario laboral). RPC `sync_excel` (solo rol admin).
- `src/lib/excelImport.ts`: lector propio del .xlsm (fflate + regex; hoja «Ausencias», fechas por letra de día, notas = comentarios). `excelExport.ts` / `opsReport.ts` con ExcelJS (carga diferida).
- `src/lib/planningImport.ts`: importar planificaciones (PC + nota «motivo · lugar · hora», conflictos, sustitutos).
- `src/lib/ops.ts`: cobertura por zona, candidatos «¿Quién puede ir?», carga de PC, saldos, revisión de datos.
- `src/lib/notes.ts`: tipos de nota guardados como texto con prefijo (🩺 Médico, 🚐 Taller/ITV, 📌 Tarea, 🎓 Formación, ✅ hecha), agenda, tareas pendientes y repetidas.
- Vistas (4 pestañas): `views/CalendarView` (+ `components/Grid`, `CodePicker`); `OpsView` (Centro de mando, Agenda, Cobertura [mapa · ¿Quién puede ir?], Cifras [Saldos · Carga · `SummaryView`]); `BackupView` = Historial y copias (`HistoryView`, `DataView part="copias"|"excel"`: copias, sincronización, exportar/importar); `SettingsView` (personas, claves, grupos, zonas, revisar datos, usuarios, contraseña admin). Móvil: `src/mobile/`. Las pestañas guardadas con nombres antiguos se traducen al cargar (`storedTab`, `storedSub`).

## Supabase (proyecto `wfgnlhgewyybbmgrchro`, UE)

- Migraciones en `supabase/migrations/001…008` (**ya aplicadas** en producción). Las nuevas se aplican con la herramienta MCP de Supabase (`apply_migration`) o en el SQL Editor, y se guardan también en el repo con el número siguiente.
- Escrituras **solo por funciones** `security definer` (tablas sin DML directo para anon/authenticated): `apply_entries`, `apply_notes`, `save_employee`, `save_code`, `replace_all`, `revert_changes/revert_batch`, `save_setting`, `set_user_role`, `sync_excel`… Cada escritura queda en `change_log` por triggers (lote = `batch_id`/`batch_label`).
- Modo administrador: contraseña bcrypt en `admin_config`, 4 h en `profiles.admin_until`. Cambios a más de 5 personas exigen modo admin (en servidor). Roles: admin, editor, lector.
- `pg_cron`: copia diaria a las 3:00 (`copia-diaria-ausencias`), se guardan las 60 últimas automáticas.
- Para probar SQL: transacción con `begin; … rollback;`, suplantando usuarios con `set_config('request.jwt.claims', …)` y `set local role authenticated`. Usuarios: AMRG (admin) y editores marg, rofb, vgp.

## Reglas de negocio que no hay que romper

- FN, FL y F (formación) nunca se sobrescriben en cambios de varias celdas ni en «Marcar periodo».
- Siglas únicas (sin distinguir mayúsculas); las rellena el admin (en la celda, en modo admin).
- Planificación: siempre PC + nota; si el día tiene otra clave, no se toca y se avisa en rojo.
- Técnicos de campo por defecto: equipos TEC.P, TEC.P.EX y COLAB; mínimo 1 por zona (Ajustes → Zonas).
- Excel de referencia: SharePoint OPERACIONES › Documentos › 3.DISPATCHER › GESTION DISPATCHER › «2026 Control Ausencias presencial.xlsm» (en 2027 será otro archivo: desactivar y elegir el nuevo).
