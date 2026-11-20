import { Component, type ReactNode } from 'react';

/**
 * Si una pantalla falla, en lugar de quedarse en blanco muestra un aviso y permite
 * recargar; el error queda en el registro (Ajustes → Errores).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onError: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: unknown) { this.props.onError(error); }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <div className="panel error-screen">
          <h2>⚠ Algo ha fallado en esta pantalla</h2>
          <p>Tus datos están a salvo: todo lo que ya se veía guardado sigue guardado. El fallo ha quedado anotado para revisarlo.</p>
          <div className="inline-form">
            <button className="primary" onClick={() => location.reload()}>↻ Recargar la app</button>
            <button onClick={() => this.setState({ failed: false })}>Intentar de nuevo</button>
          </div>
        </div>
      </div>
    );
  }
}
