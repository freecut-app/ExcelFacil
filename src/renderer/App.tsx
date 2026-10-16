import { Component, useEffect } from 'react';
import { closeDocument, handleCloseRequest, newDocument, openFile, save, saveAs, syncDirty, writeRecovery } from './actions/document';
import { focusGrid } from './actions/editing';
import { Editor } from './components/Editor';
import { HelpPanel } from './components/HelpPanel';
import { Home } from './components/Home';
import { MenuHost } from './components/Menu';
import { Busy, PanelHost, Toasts } from './components/Overlays';
import { anyDialogOpen, DialogHost } from './dialogs';
import { getState, setState, useApp } from './store';

function onGlobalKey(e: KeyboardEvent) {
  if (anyDialogOpen()) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const st = getState();
  const k = e.key.toLowerCase();
  if (e.key === 'F12') {
    e.preventDefault();
    if (st.screen === 'editor') void saveAs();
    return;
  }
  if (e.key === 'F1') {
    e.preventDefault();
    setState({ helpOpen: !st.helpOpen });
    return;
  }
  if (!ctrl) return;
  if (k === 's') {
    e.preventDefault();
    if (st.screen === 'editor') void (e.shiftKey ? saveAs() : save());
  } else if (k === 'o') {
    e.preventDefault();
    void openFile();
  } else if (k === 'n') {
    e.preventDefault();
    void newDocument('blank');
  } else if (k === 'p') {
    e.preventDefault();
    if (st.screen === 'editor') setState({ panel: { type: 'print', mode: 'print' } });
  } else if (k === 'f' || k === 'h' || k === 'l') {
    e.preventDefault();
    if (st.screen === 'editor') setState({ panel: { type: 'find', replace: k !== 'f' } });
  } else if (k === 'w') {
    e.preventDefault();
    if (st.screen === 'editor') void closeDocument();
  }
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
    void writeRecovery(true);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-brand-50 p-6">
        <div className="max-w-[520px] rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="text-xl font-semibold text-gray-900">Ops! Algo deu errado.</h1>
          <p className="mt-2 text-gray-600">
            Uma cópia de segurança do seu trabalho foi guardada. Clique em continuar; se o problema voltar, feche e abra o programa — ele vai oferecer recuperar as alterações.
          </p>
          <pre className="mt-3 max-h-[120px] overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-500">{String(this.state.error.message)}</pre>
          <button className="mt-4 h-10 rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700" onClick={() => this.setState({ error: null })}>
            Continuar
          </button>
        </div>
      </div>
    );
  }
}

export function App() {
  const screen = useApp((s) => s.screen);
  const uiScale = useApp((s) => s.settings.uiScale);

  useEffect(() => {
    void window.api.settingsGet().then((settings) => setState({ settings, zoom: settings.defaultZoom }));
    const offClose = window.api.onCloseRequested(() => void handleCloseRequest());
    const offOpen = window.api.onOpenPath((p) => void openFile(p));
    window.addEventListener('keydown', onGlobalKey);
    // Salva a recuperação ao perder o foco (por exemplo, ao trocar de programa).
    const onBlur = () => void writeRecovery();
    window.addEventListener('blur', onBlur);
    const unsub = useApp.subscribe((s, prev) => {
      if (s.meta !== prev.meta || s.screen !== prev.screen) syncDirty();
    });
    return () => {
      offClose();
      offOpen();
      window.removeEventListener('keydown', onGlobalKey);
      window.removeEventListener('blur', onBlur);
      unsub();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('ui-grande', uiScale === 'grande');
  }, [uiScale]);

  useEffect(() => {
    if (screen === 'editor') focusGrid();
  }, [screen]);

  return (
    <ErrorBoundary>
      {screen === 'home' ? <Home /> : <Editor />}
      <PanelHost />
      <HelpPanel />
      <MenuHost />
      <DialogHost />
      <Toasts />
      <Busy />
    </ErrorBoundary>
  );
}
