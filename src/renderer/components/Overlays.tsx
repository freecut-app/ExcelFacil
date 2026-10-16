import { CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { ChartPanel } from '../panels/ChartPanel';
import { FilterPopup } from '../panels/FilterPopup';
import { FindPanel } from '../panels/FindPanel';
import { PrintPanel } from '../panels/PrintPanel';
import { QuickCalcPanel } from '../panels/QuickCalcPanel';
import { DedupePanel, FunctionsPanel, SettingsPanel, WarningsPanel } from '../panels/SmallPanels';
import { TablePanel } from '../panels/TablePanel';
import { useApp } from '../store';

export function PanelHost() {
  const panel = useApp((s) => s.panel);
  const screen = useApp((s) => s.screen);
  if (!panel) return null;
  if (panel.type === 'settings') return <SettingsPanel />;
  if (screen !== 'editor') return null;
  switch (panel.type) {
    case 'quick':
      return <QuickCalcPanel op={panel.op} />;
    case 'find':
      return <FindPanel replace={panel.replace} />;
    case 'print':
      return <PrintPanel mode={panel.mode} />;
    case 'chart':
      return <ChartPanel />;
    case 'table':
      return <TablePanel />;
    case 'functions':
      return <FunctionsPanel />;
    case 'dedupe':
      return <DedupePanel />;
    case 'warnings':
      return <WarningsPanel />;
    case 'filter':
      return <FilterPopup col={panel.col} x={panel.x} y={panel.y} />;
  }
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-12 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`anim-in flex max-w-[640px] items-center gap-2 rounded-xl px-4 py-2.5 text-[0.92rem] shadow-lg ${t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-brand-700 text-white' : 'bg-gray-800 text-white'}`} data-testid="toast">
          {t.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : t.kind === 'error' ? <XCircle className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Busy() {
  const busy = useApp((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/60" data-testid="busy">
      <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        <span className="text-[1rem] text-gray-700">{busy}</span>
      </div>
    </div>
  );
}
