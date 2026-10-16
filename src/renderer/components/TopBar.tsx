import { CircleHelp, Redo2, Save, Undo2 } from 'lucide-react';
import { save } from '../actions/document';
import { redo, undo } from '../actions/editing';
import { isDirty, setState, useApp } from '../store';
import { IconButton } from './ui';

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function SaveStatus() {
  const s = useApp();
  const dirty = isDirty(s);
  const m = s.meta;
  let text: string;
  let color: string;
  if (m.saving) {
    text = 'Salvando…';
    color = 'text-gray-500';
  } else if (m.saveError) {
    text = 'Erro ao salvar';
    color = 'text-red-600';
  } else if (!dirty) {
    text = m.lastSavedAt ? `Salvo às ${timeOf(m.lastSavedAt)}` : m.filePath ? 'Sem alterações' : 'Ainda não salvo';
    color = 'text-brand-700';
  } else {
    text = m.recoveryAt ? `Não salvo • cópia de segurança às ${timeOf(m.recoveryAt)}` : 'Alterações não salvas';
    color = 'text-amber-700';
  }
  return (
    <span className={`flex items-center gap-1.5 text-[0.8rem] ${color}`} data-testid="save-status" title="As alterações só vão para o arquivo quando você clica em Salvar. Uma cópia de segurança é feita automaticamente para o caso de o computador desligar.">
      <span className={`inline-block h-2 w-2 rounded-full ${m.saving ? 'bg-gray-400' : m.saveError ? 'bg-red-500' : dirty ? 'bg-amber-500' : 'bg-brand-500'}`} />
      {text}
    </span>
  );
}

export function TopBar() {
  const name = useApp((s) => s.meta.fileName);
  useApp((s) => s.rev);
  const wb = useApp((s) => s.wb);
  const help = useApp((s) => s.helpOpen);
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 bg-brand-700 px-2 text-white">
      <div className="mr-2 flex items-center gap-2 pl-1">
        <img src="./icon.svg" alt="" className="h-6 w-6" />
        <span className="hidden text-[0.95rem] font-semibold sm:inline">Excel Fácil</span>
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5 [&_button]:text-white [&_button:hover]:bg-white/20">
        <IconButton icon={<Save className="h-[18px] w-[18px]" />} tip="Salvar (Ctrl+S)" onClick={() => void save()} testId="btn-save" tour="save" />
        <IconButton icon={<Undo2 className="h-[18px] w-[18px]" />} tip={wb?.undoLabel() ? `Desfazer: ${wb.undoLabel()} (Ctrl+Z)` : 'Desfazer (Ctrl+Z)'} disabled={!wb?.canUndo()} onClick={undo} testId="btn-undo" />
        <IconButton icon={<Redo2 className="h-[18px] w-[18px]" />} tip={wb?.redoLabel() ? `Refazer: ${wb.redoLabel()} (Ctrl+Y)` : 'Refazer (Ctrl+Y)'} disabled={!wb?.canRedo()} onClick={redo} testId="btn-redo" />
      </div>
      <div className="min-w-0 flex-1 truncate px-3 text-center text-[0.92rem] font-medium" title={name} data-testid="doc-name">
        {name}
      </div>
      <div className="mr-2 hidden rounded-md bg-white px-2 py-0.5 md:block">
        <SaveStatus />
      </div>
      <button
        className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.88rem] font-medium ${help ? 'bg-white text-brand-800' : 'bg-amber-400 text-gray-900 hover:bg-amber-300'}`}
        onClick={() => setState({ helpOpen: !help })}
        data-testid="btn-help"
        title="Instruções simples, passo a passo"
      >
        <CircleHelp className="h-[18px] w-[18px]" />
        Precisa de ajuda?
      </button>
    </div>
  );
}
