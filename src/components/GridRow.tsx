import { memo, useRef, useState } from 'react';
import type { Code, Employee, PersonGroup } from '../types';
import { isWeekend, weekday } from '../lib/dates';
import { initials } from '../lib/colors';
import { useUi } from './ui';

interface RowProps {
  emp: Employee; ri: number; days: string[]; today: string; sig: string; noteSig: string; remoteSig: string; iconSig: string;
  codeByKey: Map<string, Code>;
  selC0: number; selC1: number; rowSelected: boolean; focusC: number; flashSig: string; vacLeft?: number; canEdit: boolean;
  siglasEditable: boolean;
  onSaveSiglas?: (e: Employee, siglas: string) => Promise<boolean>;
  onDown: (r: number, c: number, shift: boolean) => void;
  onEnter: (r: number, c: number) => void;
  onSelectRow: (r: number, shift: boolean, at: { x: number; y: number }) => void;
  onOpenEmployee: (e: Employee) => void;
  onCopy: (e: Employee) => void;
  group?: PersonGroup;
}

/** Fila memorizada: solo se repinta si cambian sus marcas, su selección o su resaltado. */
export const GridRowView = memo(function GridRowView(p: RowProps) {
  const codes = p.sig.split('|');
  const notes = p.noteSig.split('\u0001');
  const icons = p.iconSig.split('|');
  const remotes = p.remoteSig.split('\u0001');
  const flashing = new Set(p.flashSig ? p.flashSig.split(',') : []);
  const info = `${p.emp.nombre}\n${[p.emp.sede, p.emp.zona, p.emp.telefono && `Tel: ${p.emp.telefono}`, p.emp.extension && `Ext: ${p.emp.extension}`].filter(Boolean).join(' · ')}`;
  const grp = p.group ? { ['--grp' as string]: p.group.color } : undefined;
  const grpTip = p.group ? `\nGrupo: ${p.group.nombre}` : '';
  return (
    <tr>
      <th className={`sticky-col name-col person ${p.group ? 'grp' : ''} ${p.rowSelected ? 'selrow' : ''} ${p.canEdit ? 'with-sel' : ''}`} scope="row" style={grp}>
        <button
          className="person-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => p.onCopy(p.emp)}
          title={`${info}${grpTip}\n\nClic: copiar nombre y teléfono`}
        >
          <span className="pname">{p.emp.nombre}</span>
          <span className="psub">{[p.emp.equipo, p.emp.zona, p.emp.sede].filter(Boolean).join(' · ')}</span>
        </button>
        {p.canEdit && (
          <button className="rowsel-btn" onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => p.onSelectRow(p.ri, e.shiftKey, { x: e.clientX + 12, y: e.clientY + 12 })}
            title="Seleccionar todo su mes · Mayús+clic: varias personas" aria-label={`Seleccionar el mes de ${p.emp.nombre}`}>▦</button>
        )}
        <button className="info-btn" onClick={() => p.onOpenEmployee(p.emp)} title="Ver ficha (teléfono, resumen y notas)" aria-label={`Ficha de ${p.emp.nombre}`}>ⓘ</button>
      </th>
      {p.siglasEditable
        ? <SiglasCell emp={p.emp} onSave={p.onSaveSiglas!} style={grp} />
        : <td className={`sticky-col sig-col sig ${p.group ? 'grp' : ''}`} style={grp}
            title={p.emp.siglas ? `🔒 Siglas: ${p.emp.siglas}${grpTip}` : `Sin siglas${grpTip}`}>{p.emp.siglas}</td>}
      <td className={`sticky-col vac-col vac ${p.vacLeft != null && p.vacLeft < 0 ? 'neg' : ''}`}>{p.vacLeft ?? ''}</td>
      {p.days.map((d, ci) => {
        const code = codes[ci];
        const c = code ? p.codeByKey.get(code) : undefined;
        const inSel = ci >= p.selC0 && ci <= p.selC1 && p.selC0 >= 0;
        const here = remotes[ci] ? remotes[ci].split('\u0003').map((x) => { const [name, color] = x.split('\u0002'); return { name, color }; }) : [];
        const cls = [
          'cell',
          isWeekend(d) ? 'we' : '',
          d === p.today ? 'today' : '',
          weekday(d) === 1 ? 'monday' : '',
          inSel ? 'sel' : '',
          ci === p.focusC ? 'focus' : '',
          flashing.has(d) ? 'flash' : '',
          code && !c ? 'unknown' : '',
          notes[ci] && !icons[ci] ? 'has-note' : '',
          icons[ci] ? 'has-ico' : '',
          here.length ? 'remote' : '',
        ].join(' ');
        const tip = [
          c ? `${c.code} · ${c.label}` : '',
          notes[ci] ? `📝 ${notes[ci]}` : '',
          here.length ? `👤 Aquí está: ${here.map((h) => h.name).join(', ')}` : '',
        ].filter(Boolean).join('\n\n');
        const style: Record<string, string> = {};
        if (c) { style.background = c.color; style.color = c.textColor; }
        if (here.length) style['--rc'] = here[0].color;
        return (
          <td
            key={d}
            data-cell={`${p.ri}-${ci}`}
            className={cls}
            style={style}
            onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); p.onDown(p.ri, ci, e.shiftKey); } }}
            onMouseEnter={() => p.onEnter(p.ri, ci)}
            title={tip || undefined}
          >
            {icons[ci] && <span className="note-ico" aria-hidden="true">{icons[ci]}</span>}
            {here.length > 0 && <span className="remote-tag" style={{ background: here[0].color }}>{initials(here[0].name)}{here.length > 1 ? `+${here.length - 1}` : ''}</span>}
            {code}
          </td>
        );
      })}
    </tr>
  );
}, (a, b) => a.sig === b.sig && a.noteSig === b.noteSig && a.iconSig === b.iconSig && a.remoteSig === b.remoteSig && a.selC0 === b.selC0 && a.selC1 === b.selC1
  && a.rowSelected === b.rowSelected && a.focusC === b.focusC && a.flashSig === b.flashSig && a.emp === b.emp && a.days === b.days
  && a.vacLeft === b.vacLeft && a.codeByKey === b.codeByKey && a.ri === b.ri && a.canEdit === b.canEdit
  && a.siglasEditable === b.siglasEditable && a.onSaveSiglas === b.onSaveSiglas
  && a.onCopy === b.onCopy && a.group === b.group);

/**
 * Celda de siglas editable (modo admin): clic → escribir → Enter guarda, Esc cancela.
 * Las siglas ya asignadas están bloqueadas: cambiarlas pide confirmación.
 */
function SiglasCell({ emp, onSave, style }: { emp: Employee; onSave: (e: Employee, siglas: string) => Promise<boolean>; style?: Record<string, string> }) {
  const { confirm } = useUi();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(emp.siglas ?? '');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const start = async () => {
    if (emp.siglas && !(await confirm({
      title: '🔒 Siglas bloqueadas',
      message: <><b>{emp.nombre}</b> ya tiene las siglas <b>{emp.siglas}</b>. Las planificaciones la buscan por ellas. ¿Seguro que quieres cambiarlas?</>,
      ok: 'Cambiar siglas',
    }))) return;
    setValue(emp.siglas ?? ''); done.current = false; setEditing(true);
  };
  const finish = async (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = value.trim().toUpperCase();
    if (!save || v === (emp.siglas ?? '')) { setEditing(false); return; }
    setBusy(true);
    const ok = await onSave(emp, v);
    setBusy(false);
    if (ok) setEditing(false); else done.current = false;
  };
  if (!editing) {
    return (
      <td className={`sticky-col sig-col sig editable ${style ? 'grp' : ''}`} style={style}
        title={emp.siglas ? `🔒 Siglas bloqueadas: ${emp.siglas} · clic para cambiarlas (pide confirmación)` : 'Modo admin: clic para poner las siglas'}
        onMouseDown={(e) => e.preventDefault()} onClick={start}>
        {emp.siglas || <span className="sig-empty">＋</span>}
      </td>
    );
  }
  return (
    <td className="sticky-col sig-col sig editing">
      <input
        autoFocus value={value} maxLength={10} disabled={busy} aria-label={`Siglas de ${emp.nombre}`}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        onBlur={() => finish(true)}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </td>
  );
}
