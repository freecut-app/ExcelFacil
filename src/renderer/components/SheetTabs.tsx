import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { addSheet, deleteSheet, duplicateSheet, focusGrid, moveSheet, renameSheetDirect, selectSheet } from '../actions/editing';
import { useApp } from '../store';
import { openMenu } from './Menu';

export function SheetTabs() {
  const wb = useApp((s) => s.wb)!;
  useApp((s) => s.rev);
  const active = useApp((s) => s.active);
  const [renaming, setRenaming] = useState<{ index: number; value: string; error: string | null } | null>(null);

  const menu = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    selectSheet(i);
    const ic = 'h-4 w-4';
    openMenu(e.clientX, e.clientY - 220, [
      { label: 'Renomear', icon: <Pencil className={ic} />, onClick: () => setRenaming({ index: i, value: wb.sheets[i].name, error: null }) },
      { label: 'Duplicar', icon: <Copy className={ic} />, onClick: () => duplicateSheet(i) },
      { label: 'Mover para a esquerda', icon: <ChevronLeft className={ic} />, disabled: i === 0, onClick: () => moveSheet(i, -1) },
      { label: 'Mover para a direita', icon: <ChevronRight className={ic} />, disabled: i === wb.sheets.length - 1, onClick: () => moveSheet(i, 1) },
      { separator: true },
      { label: 'Excluir aba', icon: <Trash2 className={ic} />, danger: true, disabled: wb.sheets.length <= 1, onClick: () => void deleteSheet(i) },
    ]);
  };

  const finishRename = () => {
    if (!renaming) return;
    const err = renaming.value.trim() === wb.sheets[renaming.index].name ? null : renameSheetDirect(renaming.index, renaming.value);
    if (err) setRenaming({ ...renaming, error: err });
    else {
      setRenaming(null);
      focusGrid();
    }
  };

  return (
    <div className="flex h-10 shrink-0 items-stretch border-t border-gray-200 bg-gray-50" data-tour="tabs">
      <button className="flex w-10 shrink-0 items-center justify-center text-brand-700 hover:bg-brand-50" title="Nova aba" aria-label="Nova aba" onClick={addSheet} data-testid="btn-add-sheet">
        <Plus className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="Abas da planilha">
        {wb.sheets.map((s, i) =>
          renaming?.index === i ? (
            <div key={s.uid} className="relative flex items-center px-1">
              <input
                autoFocus
                className="h-8 w-[160px] rounded border border-brand-500 px-2 text-sm outline-none"
                value={renaming.value}
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value, error: null })}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') finishRename();
                  if (e.key === 'Escape') {
                    setRenaming(null);
                    focusGrid();
                  }
                }}
                data-testid="sheet-rename-input"
              />
              {renaming.error && <div className="absolute bottom-full left-0 mb-1 w-[260px] rounded-md bg-red-600 px-2 py-1 text-xs text-white shadow">{renaming.error}</div>}
            </div>
          ) : (
            <button
              key={s.uid}
              role="tab"
              aria-selected={i === active}
              data-testid={`sheet-tab-${i}`}
              title="Clique para abrir • duplo clique para renomear • botão direito para mais opções"
              className={`max-w-[220px] shrink-0 truncate border-r border-gray-200 px-4 text-[0.88rem] ${i === active ? 'bg-white font-semibold text-brand-800 shadow-[inset_0_3px_0_var(--color-brand-600)]' : 'text-gray-600 hover:bg-white/70'}`}
              onClick={() => selectSheet(i)}
              onDoubleClick={() => setRenaming({ index: i, value: s.name, error: null })}
              onContextMenu={(e) => menu(e, i)}
            >
              {s.name}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
