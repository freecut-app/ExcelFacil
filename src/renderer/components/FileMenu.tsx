import { ArrowLeft, FilePlus2, FileSpreadsheet, FileText, FolderOpen, Printer, Save, SaveAll, Settings, X, FileDown, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { closeDocument, exportCsv, newDocument, openFile, save, saveAs } from '../actions/document';
import { focusGrid } from '../actions/editing';
import { setState, useApp } from '../store';

function Item(props: { icon: React.ReactNode; label: string; desc: string; onClick: () => void; testId?: string; shortcut?: string }) {
  return (
    <button
      className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-white/15"
      onClick={props.onClick}
      data-testid={props.testId}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">{props.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1rem] font-medium">{props.label}</span>
        <span className="block text-[0.8rem] text-white/75">{props.desc}</span>
      </span>
      {props.shortcut && <span className="text-xs text-white/60">{props.shortcut}</span>}
    </button>
  );
}

export function FileMenu() {
  const open = useApp((s) => s.fileMenu);
  const warnings = useApp((s) => s.meta.warnings);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setState({ fileMenu: false });
        focusGrid();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const run = (fn: () => unknown) => () => {
    setState({ fileMenu: false });
    void fn();
  };
  const ic = 'h-5 w-5';
  return (
    <div className="fixed inset-0 z-[70] flex bg-black/25" onMouseDown={(e) => e.target === e.currentTarget && setState({ fileMenu: false })}>
      <div className="anim-in flex h-full w-[380px] max-w-[92vw] flex-col overflow-y-auto bg-brand-700 p-4 text-white shadow-2xl" data-testid="file-menu">
        <button className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[0.95rem] hover:bg-white/15" onClick={() => { setState({ fileMenu: false }); focusGrid(); }}>
          <ArrowLeft className="h-5 w-5" /> Voltar para a planilha
        </button>
        <Item icon={<FilePlus2 className={ic} />} label="Nova planilha" desc="Começar uma planilha em branco" shortcut="Ctrl+N" onClick={run(() => newDocument('blank'))} testId="fm-new" />
        <Item icon={<FolderOpen className={ic} />} label="Abrir" desc="Abrir um arquivo do Excel (.xlsx) ou CSV" shortcut="Ctrl+O" onClick={run(() => openFile())} testId="fm-open" />
        <Item icon={<Save className={ic} />} label="Salvar" desc="Guardar as alterações no arquivo" shortcut="Ctrl+S" onClick={run(save)} testId="fm-save" />
        <Item icon={<SaveAll className={ic} />} label="Salvar como…" desc="Escolher um novo nome ou pasta" shortcut="F12" onClick={run(saveAs)} testId="fm-saveas" />
        <div className="my-2 border-t border-white/20" />
        <div className="px-4 pb-1 text-xs uppercase tracking-wider text-white/60">Exportar</div>
        <Item icon={<FileDown className={ic} />} label="Exportar como PDF" desc="Gera um PDF da aba atual, pronto para enviar" onClick={run(() => setState({ panel: { type: 'print', mode: 'pdf' } }))} testId="fm-pdf" />
        <Item icon={<FileText className={ic} />} label="Exportar como CSV" desc="Texto separado por ponto e vírgula (aba atual)" onClick={run(exportCsv)} testId="fm-csv" />
        <Item icon={<FileSpreadsheet className={ic} />} label="Salvar cópia em Excel (.xlsx)" desc="Igual a Salvar como" onClick={run(saveAs)} />
        <div className="my-2 border-t border-white/20" />
        <Item icon={<Printer className={ic} />} label="Imprimir" desc="Ver como fica e imprimir" shortcut="Ctrl+P" onClick={run(() => setState({ panel: { type: 'print', mode: 'print' } }))} testId="fm-print" />
        {warnings.length > 0 && (
          <Item icon={<AlertTriangle className={ic} />} label="Avisos do arquivo" desc="Recursos do arquivo original que não são suportados" onClick={run(() => setState({ panel: { type: 'warnings' } }))} />
        )}
        <Item icon={<Settings className={ic} />} label="Configurações" desc="Tamanho da letra, salvamento automático e zoom" onClick={run(() => setState({ panel: { type: 'settings' } }))} testId="fm-settings" />
        <div className="flex-1" />
        <Item icon={<X className={ic} />} label="Fechar planilha" desc="Voltar para a tela inicial" onClick={run(closeDocument)} testId="fm-close" />
      </div>
    </div>
  );
}
