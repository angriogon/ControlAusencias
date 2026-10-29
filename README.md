# Control de Ausencias

App web instalable (PWA) que sustituye al Excel «Control Ausencias presencial» de SharePoint: un calendario compartido donde todo el equipo marca vacaciones, bajas, festivos, presencial en cliente, etc. a la vez, con guardado automático, historial de cambios y copias de seguridad.

## Qué resuelve respecto al Excel

| Problema del Excel | En la app |
|---|---|
| Lento y se congela al copiar/pegar o borrar filas/columnas (la hoja tiene ~1.700 reglas de formato condicional y 400+ columnas) | Se ve un mes cada vez; los colores salen de la propia clave, sin fórmulas ni formatos condicionales |
| Si alguien borra algo no se sabe quién fue | **Historial**: quién, cuándo, valor anterior y nuevo, con botón **Deshacer** |
| Sin vuelta atrás fiable | **Copias de seguridad** (manuales, automáticas antes de restaurar/importar y opcionalmente cada noche) |
| Errores al copiar bloques de columnas (hay una semana de marzo de 2026 duplicada) | Las fechas son datos, no columnas: no se pueden duplicar |
| Claves escritas a mano («pc», «v», «LH») | Paleta de claves con colores y nombre; al pegar se corrigen solas |

## Cómo se usa (para el equipo)

- **Marcar un día**: clic en la celda → elige la clave en la paleta (o escribe «v» + Enter).
- **Marcar varios**: arrastra con el ratón por encima de los días/personas y elige la clave.
- **Vacaciones de X a Y o festivo para todos**: botón **＋ Marcar periodo**.
- **Borrar**: selecciona y pulsa `Supr`, o «Vaciar celda(s)» en la paleta.
- **Me he equivocado**: `Ctrl+Z` o botón **↶ Deshacer** arriba. Para cambios de otros o más antiguos: pestaña **Historial**.
- `Ctrl+C` / `Ctrl+V` funcionan como en Excel (también pegando desde Excel).
- Clic en el nombre de una persona: teléfono, extensión y resumen del año.
- La columna **Vac.** muestra las vacaciones (V) que le quedan en el año. Abajo, el total de ausencias del día y el %.
- Instalar en el PC: en Edge/Chrome, icono «Instalar aplicación» en la barra de direcciones.

## Modos de funcionamiento

1. **Modo local (prueba)**: si no se configura servidor, la app funciona con datos de ejemplo guardados solo en ese navegador. Sirve para probarla, no para compartir.
2. **Modo equipo (Supabase)**: base de datos PostgreSQL compartida, inicio de sesión por usuario, cambios en tiempo real entre compañeros y auditoría hecha por la propia base de datos (no se puede falsear desde el navegador).

## Puesta en marcha del modo equipo

> ⚠️ **Antes de nada:** el Excel contiene datos personales (nombres, teléfonos personales). Subirlos a un servicio externo (Supabase, servidores en la UE) debe estar autorizado por tu empresa/IT (RGPD). Si no lo está, la alternativa es la misma app contra SharePoint/Microsoft 365 (ver «Alternativas»).

1. Crea un proyecto en [supabase.com](https://supabase.com) (región UE, p. ej. Frankfurt/Irlanda).
2. **SQL Editor** → pega y ejecuta `supabase/migrations/001_init.sql`.
3. **Authentication → Sign In / Providers**: desactiva «Allow new users to sign up» (solo entran los que des de alta).
4. **Authentication → Users → Add user** para cada compañero (correo + contraseña). Opcional: en «User metadata» `{"name": "Nombre Apellido"}` para que el historial muestre su nombre.
5. Hazte administrador (SQL Editor):
   ```sql
   update public.profiles set role = 'admin' where email = 'tu-correo@empresa.com';
   -- roles: admin (todo), editor (marcar y editar fichas), lector (solo ver)
   ```
6. Copia `.env.example` a `.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings → API). La clave *anon* es pública por diseño; la seguridad la dan las políticas RLS del SQL.
7. Entra en la app como admin → **Copias y Excel → Importar el Excel antiguo** → elige el `.xlsm`. Verás un resumen y avisos antes de confirmar.
8. (Opcional, recomendado) Copia automática diaria: activa la extensión `pg_cron` y ejecuta las dos líneas del final del SQL.

## Publicar en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila y publica en cada push a `main`.

1. Repo → **Settings → Pages** → Source: **GitHub Actions**.
2. Repo → **Settings → Secrets and variables → Actions → Variables**: crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Push a `main`. La URL será `https://<usuario>.github.io/<repo>/`.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas
npm run build      # compila en dist/
XLSX_PATH=/ruta/Control_Ausencias.xlsm npm test   # prueba el importador con el Excel real
```

Stack: React 19 + TypeScript + Vite + vite-plugin-pwa, Supabase (PostgreSQL, Auth, Realtime). ExcelJS solo se carga al exportar.

### Estructura

```
src/
  data/        store.ts (interfaz común), localStore.ts, supabaseStore.ts, useAppData.ts (estado + guardado optimista)
  lib/         fechas, claves, importar/exportar Excel
  components/  Grid (calendario), CodePicker (paleta), ui (modales, avisos)
  views/       Calendario, Resumen, Historial, Copias y Excel, Ajustes
supabase/migrations/001_init.sql   tablas, auditoría por triggers, RPC de deshacer/copias, RLS, realtime
```

La interfaz solo habla con `DataStore`; cambiar de backend (p. ej. a SharePoint/Graph) es escribir otro adaptador.

## Datos y privacidad

- `.gitignore` bloquea `*.xlsx/*.xlsm`: los datos reales **nunca** deben subirse al repositorio. La importación se hace en el navegador del administrador.
- Los datos de ejemplo del modo local son ficticios.

## Alternativas consideradas

- **Lista de SharePoint + Power Apps**: encaja en M365 y tiene versionado nativo, pero una cuadrícula persona × día de 100+ filas es incómoda y lenta en Power Apps.
- **Esta app contra SharePoint vía Microsoft Graph**: posible con un adaptador nuevo, pero requiere registrar una aplicación en Entra ID (permiso de IT).
- **Arreglar el Excel**: limpiar las ~1.700 reglas de formato condicional y las columnas rotas aliviaría la lentitud, pero no da historial por usuario ni deshacer fiable.
