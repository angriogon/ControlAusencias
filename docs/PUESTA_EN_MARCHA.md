# Lista de comprobación · Puesta en marcha

Marca cada punto al completarlo. Los marcados con ⛔ bloquean el arranque: sin ellos, no abrir la app al equipo.

## 1. Autorización y datos

- [ ] ⛔ **Visto bueno de IT / protección de datos** para guardar en Supabase (servidores en la UE) nombres, teléfonos y notas del equipo, **incluidas citas médicas** (pueden considerarse datos de salud según el RGPD). Guardar el correo o documento de aprobación.
- [ ] Decidir quién es el **responsable** de la app (administrador principal) y quién le sustituye en vacaciones.
- [ ] Comprobar que la contraseña de **modo administrador** la conocen solo esas personas.

## 2. Supabase

- [ ] ⛔ **Authentication → URL Configuration → Site URL** = `https://angriogon.github.io/ControlAusencias/` (si no, el correo de «olvidé mi contraseña» lleva a una dirección rota). Añadirla también en *Redirect URLs*.
- [ ] **Authentication → Sign In / Providers**: «Allow new users to sign up» **desactivado** (solo entra quien des de alta).
- [ ] Decidir el **plan**: gratuito (se pausa tras días sin uso; sin copias gestionadas) o de pago (copias diarias gestionadas, sin pausas). Si se queda en gratuito, el punto 3 es obligatorio.
- [ ] Revisar **Advisors → Security** sin avisos críticos.

## 3. Copias de seguridad

- [x] Copia automática diaria a las 3:00 activa (se guardan las 60 últimas). *Comprobado el 31/10/2026.*
- [ ] ⛔ **Copia fuera de Supabase**: cada lunes, *Copias y Excel → Exportar a Excel* y guardar el Excel en SharePoint (carpeta: _______________). Poner un recordatorio en Outlook.
- [ ] Probar **una restauración** completa una vez (crear copia → restaurar → comprobar) para saber hacerlo con calma.

## 4. Usuarios

- [ ] Dar de alta a cada persona: Supabase → Authentication → Users → *Add user* (correo + contraseña temporal; en *User metadata* `{"name": "Nombre Apellido"}`).
- [ ] Asignar roles en la app (Ajustes → Usuarios): dispatchers = **Editor** · técnicos y responsables = **Solo consulta** · responsable = **Administrador**.
- [ ] Probar el acceso con un usuario **Solo consulta** (no debe poder marcar nada).
- [ ] Probar «He olvidado mi contraseña» con un usuario de prueba (depende del punto 2).

## 5. Datos listos

- [ ] Rellenar las **siglas** de los técnicos (calendario en modo admin → clic en la celda Siglas).
- [ ] Operativa → **Revisar datos** sin fichas incompletas relevantes.
- [ ] Ajustes → **Zonas**: zonas vecinas y mínimos revisados.
- [ ] Revisar la clave **FS (importada, revisar)**: sustituirla por la correcta o confirmar que se usa.
- [ ] Importación final del Excel (si hubo cambios en el Excel desde la última importación) **justo antes** del arranque.

## 6. Día de arranque

- [ ] ⛔ Poner el **Excel antiguo en solo lectura** en SharePoint y avisar: «desde hoy, solo en la app». Nunca los dos a la vez.
- [ ] Enviar al equipo: dirección de la app, cómo instalarla (PC y móvil) y el botón **?** de la guía rápida.
- [ ] Crear una **copia manual** con el nombre «Arranque» (Copias y Excel).

## 7. Piloto (2–3 semanas)

- [ ] No añadir funciones nuevas durante el piloto; solo corregir errores.
- [ ] Apuntar lo que pida o le cueste al equipo (fecha · quién · qué).
- [ ] Revisión al final del piloto: qué se corrige, qué se descarta y si se cierra la versión 1.0.

## Mantenimiento técnico

- [x] Cada pull request pasa tipos, pruebas y compilación antes de fusionarse (flujo «Pruebas»).
- [x] La publicación en Pages vuelve a pasarlos y no publica si fallan.
- [ ] (Opcional) GitHub → Settings → Branches: exigir que el check **Pruebas** esté en verde para poder fusionar en `main`.
