import { Modal } from '../components/ui';

/** Guía rápida de una pantalla: lo justo para empezar a usar la app sin formación. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="❓ Guía rápida" wide onClose={onClose} footer={<button className="primary" onClick={onClose}>Entendido</button>}>
      <div className="help">
        <section>
          <h3>📅 Marcar el calendario</h3>
          <ul>
            <li><b>Un día:</b> clic en la celda → elige la clave (o escribe «v» y Enter).</li>
            <li><b>Varios:</b> arrastra con el ratón. <b>Todo el mes de alguien:</b> clic en su nombre. <b>Un día para todos:</b> clic en el número del día.</li>
            <li><b>Nota:</b> en la paleta, a la derecha. Elige el tipo (🩺 Médico, 🚐 Taller/ITV, 📌 Tarea, 🎓 Formación) y la hora; debajo salen textos que se usan a menudo.</li>
            <li>En la celda se ve el icono del tipo (o un triángulo rojo si es una nota normal). Pasando el ratón se lee.</li>
            <li>Una <b>📌 Tarea</b> se puede repetir cada semana o cada mes. Al marcar <b>P</b> o <b>A</b>, se ofrece apuntar el motivo.</li>
            <li><b>Borrar:</b> selecciona y pulsa <kbd>Supr</kbd> (borra clave y nota).</li>
            <li><b>Vacaciones de X a Y:</b> botón «＋ Marcar periodo».</li>
            <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> como en Excel, también desde Excel.</li>
          </ul>
        </section>
        <section>
          <h3>↶ Me he equivocado</h3>
          <ul>
            <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> o «↶ Deshacer» arriba deshace tu último cambio.</li>
            <li>Cambios más antiguos o de otros: pestaña <b>Historial</b> → «Deshacer».</li>
            <li>Todo se guarda solo al momento (arriba pone «✓ Todo guardado»).</li>
          </ul>
        </section>
        <section>
          <h3>🧭 Operativa (dispatch)</h3>
          <ul>
            <li><b>Centro de mando:</b> quién trabaja hoy o el siguiente laborable en cada zona, alertas (también citas en días con PC) y novedades.</li>
            <li><b>Agenda y tareas:</b> médicos, talleres, formación y tareas de los próximos días; tareas pendientes hasta marcarlas ✓ hechas; buscador en todas las notas. «Ir al día» abre la celda.</li>
            <li>La franja azul de arriba resume lo de hoy y el próximo laborable (se oculta con ✕ hasta mañana).</li>
            <li><b>Cobertura:</b> semáforo de zonas por día. 🟢 cubierta · 🟡 justa · 🔴 sin cubrir · ⚪ festivo.</li>
            <li><b>¿Quién puede ir?:</b> zona + día → técnicos disponibles, primero los de la zona y con menos carga.</li>
            <li><b>Carga</b> de PC por técnico, <b>Saldos</b> (vacaciones, festivos trabajados) y <b>Revisar datos</b>.</li>
            <li>Al marcar una ausencia que deja una zona sin el mínimo de técnicos, sale un aviso amarillo (no bloquea).</li>
          </ul>
        </section>
        <section>
          <h3>🔒 Protecciones</h3>
          <ul>
            <li>FN, FL y F no se sobrescriben en cambios de varias celdas.</li>
            <li>Cambios a más de 5 personas, importar, restaurar copias y editar fichas o siglas requieren el <b>modo administrador</b>.</li>
            <li>En modo administrador, clic en las <b>siglas</b> de una persona para editarlas ahí mismo.</li>
          </ul>
        </section>
        <section>
          <h3>📱 En el móvil</h3>
          <ul>
            <li>Se abre una vista propia: <b>Hoy</b> (quién falta) y <b>Personas</b> (buscar, llamar, ver su mes).</li>
            <li>Tocando un día se cambia su clave y su nota. La sesión se cierra tras 8 h sin uso.</li>
            <li>Instalar: Android → Chrome → «Instalar aplicación»; iPhone → Safari → Compartir → «Añadir a pantalla de inicio».</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
