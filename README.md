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
- **Filas y columnas**: clic en el nombre = todo su mes; clic en el número del día = ese día para todos; Mayús+clic amplía; clic en «Persona» = todo el mes. La ficha se abre con ⓘ.
- **Paleta**: escribe para filtrar, muévete con las flechas y pulsa Enter: guarda la clave y la nota a la vez.
- **Protegidas**: FN, FL y F nunca se sobrescriben en cambios de varias celdas ni en «Marcar periodo» (se avisa en rojo).
- **Compañeros**: se ve en qué celda está cada uno (recuadro de color con sus iniciales).
- **📥 Importar planificación** (calendario): carga el Excel de la planificación (fecha, hora, lugar y siglas en «Siglas» o «Empresa instaladora»). Marca **PC** con una nota «motivo · lugar · hora»; si el día tiene otra clave no se toca y se avisa en rojo; si ya tenía PC solo añade la nota. Se cruza por las **siglas** de cada persona (Ajustes). Ctrl+Z deshace la importación entera.
- **🔒 Modo administrador** (botón arriba, contraseña compartida, dura 4 h): necesario para importar, restaurar copias, gestionar personas y claves, y cambios a más de 5 personas a la vez. La contraseña se crea en Ajustes → Contraseña admin (usuarios con rol admin).
- **Vacaciones de X a Y o festivo para todos**: botón **＋ Marcar periodo**. Avisa antes si el periodo deja alguna zona por debajo de su mínimo de técnicos.
- **Siglas**: en modo administrador, clic en la celda de siglas del calendario para editarlas ahí mismo (Enter guarda, Esc cancela; no deja repetir siglas).
- **Sustitutos en la planificación**: si un día planificado choca con otra clave (vacaciones, baja…), se puede elegir un sustituto disponible; se le marca PC con la nota «… · sustituye a XX».
- **Borrar**: selecciona y pulsa `Supr`, o «Vaciar celda(s)» en la paleta.
- **🧭 Operativa** (pestaña para dispatch, sobre los técnicos de campo: equipos configurables en Ajustes → Zonas):
  - **Centro de mando**: hoy o el siguiente laborable, zona a zona: quién trabaja, quién falta y por qué, quién está en cliente; alertas (zonas sin cubrir en los próximos 10 laborables, bajas de 5 días o más, vacaciones pendientes a fin de año) y novedades de otros compañeros.
  - **Cobertura**: semáforo zonas × días (1, 2 o 4 semanas). 🟢 cubierta · 🟡 justa (en el mínimo) · 🔴 sin cubrir · ⚪ festivo (FN/FL).
  - **¿Quién puede ir?**: zona + día → disponibles, primero de la zona, luego zonas vecinas y, si no hay nadie, del resto; libres antes que en cliente y con menos carga de PC esa semana/mes.
  - **Carga**: días de PC por técnico (media jornada = 0,5) frente a la mediana de su zona, con TS y TF.
  - **Saldos**: vacaciones y VP pendientes, festivos/sábados trabajados (TF+TS) frente a libres (Lf+Lh, informativo), bajas y PC.
  - **Revisar datos**: fichas sin siglas, zona, equipo o días de vacaciones y claves «a revisar».
  - **📄 Informe mensual (Excel)**: zonas (absentismo por tipo, PC, días sin cubrir), cobertura día a día, personas y saldos del año.
  - Reglas: «fuera» = clave de tipo ausencia; FN/FL = festivo; PC = trabajando en cliente; el resto de claves = disponible. Fines de semana no cuentan. Al marcar una ausencia que deja una zona bajo su mínimo, sale un aviso amarillo (no bloquea).
- **Ajustes → Zonas** (modo admin): equipos que son «técnicos de campo», mínimo de técnicos por zona (por defecto 1) y zonas vecinas (la vecindad es mutua).
- **Ajustes → Usuarios** (rol admin + modo admin): cambiar el rol de cada usuario (Administrador / Editor / Solo consulta). Siempre queda al menos un administrador.
- **❓** arriba: guía rápida de una pantalla.
- **Me he equivocado**: `Ctrl+Z` o botón **↶ Deshacer** arriba. Para cambios de otros o más antiguos: pestaña **Historial**.
- `Ctrl+C` / `Ctrl+V` funcionan como en Excel (también pegando desde Excel).
- **Notas** (como las del Excel): las celdas con nota llevan un triángulo rojo en la esquina; se leen pasando el ratón y se escriben o borran desde la paleta («📝 Añadir nota a este día»). Una celda puede tener nota aunque no tenga clave. Quedan en el historial y se pueden deshacer.
- Clic en el nombre de una persona: teléfono, extensión, resumen del año y sus notas.
- La columna **Vac.** muestra las vacaciones (V) que le quedan en el año. Abajo, el total de ausencias del día y el %.
- Instalar en el PC: en Edge/Chrome, icono «Instalar aplicación» en la barra de direcciones.
- **En el móvil** se abre sola una vista propia: **Hoy** (quién falta un día, agrupado por clave, con filtros por equipo y zona) y **Personas** (buscador → ficha con botón de llamar, su mes en calendario y sus notas). Tocando un día se cambia su clave y su nota; lo masivo se hace en el PC. La sesión se cierra sola tras 8 horas sin uso. Instalar: Android → Chrome → «Instalar aplicación»; iPhone → Safari → Compartir → «Añadir a pantalla de inicio».

## Modos de funcionamiento

1. **Modo local (prueba)**: si no se configura servidor, la app funciona con datos de ejemplo guardados solo en ese navegador. Sirve para probarla, no para compartir.
2. **Modo equipo (Supabase)**: base de datos PostgreSQL compartida, inicio de sesión por usuario, cambios en tiempo real entre compañeros y auditoría hecha por la propia base de datos (no se puede falsear desde el navegador).

## Puesta en marcha del modo equipo

> ⚠️ **Antes de nada:** el Excel contiene datos personales (nombres, teléfonos personales). Subirlos a un servicio externo (Supabase, servidores en la UE) debe estar autorizado por tu empresa/IT (RGPD). Si no lo está, la alternativa es la misma app contra SharePoint/Microsoft 365 (ver «Alternativas»).

1. Crea un proyecto en [supabase.com](https://supabase.com) (región UE, p. ej. Frankfurt/Irlanda).
2. **SQL Editor** → pega y ejecuta, en orden, los archivos de `supabase/migrations/` (`001`, `002`, `003`…).
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
