import { Minus, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { formatNumberBR } from '../../core/format';
import { selectionStats } from '../../core/ops';
import { setZoom } from '../actions/editing';
import { currentSheet, selRange, useApp } from '../store';
import { SaveStatus } from './TopBar';

function fmt(n: number | null): string {
  if (n === null) return '—';
  return formatNumberBR(parseFloat(n.toPrecision(12)), undefined, true);
}

export function StatusBar() {
  const sel = useApp((s) => s.sel);
  const rev = useApp((s) => s.rev);
  const zoom = useApp((s) => s.zoom);
  const wb = useApp((s) => s.wb);
  const active = useApp((s) => s.active);
  const stats = useMemo(() => {
    const sh = currentSheet();
    if (!wb || !sh) return null;
    const rg = selRange(sel);
    if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return null;
    return selectionStats(wb, sh, [rg]);
  }, [wb, sel, rev, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-8 shrink-0 items-center gap-4 border-t border-gray-200 bg-white px-3 text-[0.8rem] text-gray-600" data-testid="status-bar">
      <SaveStatus />
      <div className="flex-1" />
      {stats && stats.countA > 0 && (
        <div className="flex items-center gap-4" data-testid="selection-stats" title="Cálculo automático dos números selecionados">
          {stats.count > 0 && (
            <>
              <span>
                Soma: <b className="text-gray-800">{fmt(stats.sum)}</b>
              </span>
              <span>
                Média: <b className="text-gray-800">{fmt(stats.avg)}</b>
              </span>
              <span className="hidden lg:inline">
                Menor: <b className="text-gray-800">{fmt(stats.min)}</b>
              </span>
              <span className="hidden lg:inline">
                Maior: <b className="text-gray-800">{fmt(stats.max)}</b>
              </span>
            </>
          )}
          <span>
            Preenchidas: <b className="text-gray-800">{stats.countA}</b>
          </span>
        </div>
      )}
      <div className="flex items-center gap-1">
        <button className="rounded p-0.5 hover:bg-gray-100" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => setZoom(zoom - 10)}>
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={50}
          max={200}
          step={10}
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
          className="w-[110px] accent-brand-600"
          aria-label="Zoom"
          title="Zoom da planilha"
        />
        <button className="rounded p-0.5 hover:bg-gray-100" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => setZoom(zoom + 10)}>
          <Plus className="h-4 w-4" />
        </button>
        <button className="w-12 rounded text-center hover:bg-gray-100" title="Voltar para 100%" onClick={() => setZoom(100)}>
          {zoom}%
        </button>
      </div>
    </div>
  );
}
