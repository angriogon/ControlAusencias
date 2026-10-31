import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ---------------- Modal ----------------
export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, button.primary')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------- Avisos (toasts) ----------------
interface Toast { id: number; text: string; kind: 'ok' | 'error' | 'info' | 'warn'; action?: { label: string; run: () => void } }
interface Ui {
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}
interface ConfirmOpts { title: string; message: ReactNode; ok?: string; cancel?: string; danger?: boolean }

const UiCtx = createContext<Ui | null>(null);
export const useUi = () => useContext(UiCtx)!;

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);

  const toast = useCallback<Ui['toast']>((text, kind = 'ok', action) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 9000 : kind === 'error' || kind === 'warn' ? 8000 : 3500);
  }, []);

  const confirm = useCallback<Ui['confirm']>((o) => new Promise((resolve) => setDialog({ ...o, resolve })), []);
  const close = (v: boolean) => { dialog?.resolve(v); setDialog(null); };

  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {dialog && (
        <Modal title={dialog.title} onClose={() => close(false)} footer={<>
          <button onClick={() => close(false)}>{dialog.cancel ?? 'Cancelar'}</button>
          <button className={dialog.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dialog.ok ?? 'Aceptar'}</button>
        </>}>
          <div className="confirm-msg">{dialog.message}</div>
        </Modal>
      )}
    </UiCtx.Provider>
  );
}

// ---------------- Chip de clave ----------------
export function CodeChip({ code, color, textColor, small }: { code: string; color?: string; textColor?: string; small?: boolean }) {
  return (
    <span className={`chip ${small ? 'small' : ''}`} style={{ background: color ?? '#ddd', color: textColor ?? '#000' }}>
      {code}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
