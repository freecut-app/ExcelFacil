import { Lightbulb, X } from 'lucide-react';
import { Grid } from '../grid/Grid';
import { setState, useApp } from '../store';
import { FileMenu } from './FileMenu';
import { FormulaBar } from './FormulaBar';
import { Ribbon } from './Ribbon';
import { SheetTabs } from './SheetTabs';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

function Tips() {
  const show = useApp((s) => s.settings.showWelcomeTips);
  if (!show) return null;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[0.85rem] text-amber-900" data-testid="tips">
      <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="flex-1">
        <b>Dica:</b> clique numa célula e comece a digitar. Para somar, selecione os números e clique em <b>Somar seleção</b>. Errou? <b>Ctrl+Z</b> desfaz.
      </span>
      <button
        className="rounded p-0.5 hover:bg-amber-100"
        title="Não mostrar mais"
        aria-label="Fechar dica"
        onClick={async () => {
          const s = await window.api.settingsSet({ showWelcomeTips: false });
          setState({ settings: s });
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Editor() {
  return (
    <div className="flex h-full flex-col" data-testid="editor">
      <TopBar />
      <Ribbon />
      <FormulaBar />
      <Tips />
      <Grid />
      <SheetTabs />
      <StatusBar />
      <FileMenu />
    </div>
  );
}
