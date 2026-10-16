// Menu do botão direito sobre células, linhas e colunas.
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ClipboardPaste, Copy, Eraser, MoveHorizontal, PaintBucket, Scissors, Trash2 } from 'lucide-react';
import {
  autofitColumns,
  clearSelection,
  copySelection,
  deleteCols,
  deleteRows,
  insertCols,
  insertRows,
  pasteSelection,
} from '../actions/editing';
import { openMenu, MenuItem } from './Menu';

export function openCellMenu(x: number, y: number, kind: 'cell' | 'row' | 'col'): void {
  const ic = 'h-4 w-4';
  const base: MenuItem[] = [
    { label: 'Recortar', icon: <Scissors className={ic} />, shortcut: 'Ctrl+X', onClick: () => void copySelection(true) },
    { label: 'Copiar', icon: <Copy className={ic} />, shortcut: 'Ctrl+C', onClick: () => void copySelection(false) },
    { label: 'Colar', icon: <ClipboardPaste className={ic} />, shortcut: 'Ctrl+V', onClick: () => void pasteSelection('all') },
    { label: 'Colar só os valores', icon: <ClipboardPaste className={ic} />, shortcut: 'Ctrl+Shift+V', onClick: () => void pasteSelection('values') },
    { label: 'Colar só a formatação', icon: <PaintBucket className={ic} />, onClick: () => void pasteSelection('formats') },
    { separator: true },
  ];
  const rows: MenuItem[] = [
    { label: 'Inserir linha acima', icon: <ArrowUpToLine className={ic} />, onClick: () => insertRows('above') },
    { label: 'Inserir linha abaixo', icon: <ArrowDownToLine className={ic} />, onClick: () => insertRows('below') },
    { label: 'Excluir linha', icon: <Trash2 className={ic} />, danger: true, onClick: () => void deleteRows() },
  ];
  const cols: MenuItem[] = [
    { label: 'Inserir coluna à esquerda', icon: <ArrowLeftToLine className={ic} />, onClick: () => insertCols('left') },
    { label: 'Inserir coluna à direita', icon: <ArrowRightToLine className={ic} />, onClick: () => insertCols('right') },
    { label: 'Excluir coluna', icon: <Trash2 className={ic} />, danger: true, onClick: () => void deleteCols() },
    { label: 'Ajustar largura ao conteúdo', icon: <MoveHorizontal className={ic} />, onClick: () => autofitColumns() },
  ];
  const tail: MenuItem[] = [
    { separator: true },
    { label: 'Apagar conteúdo', icon: <Eraser className={ic} />, shortcut: 'Delete', onClick: () => clearSelection('contents') },
    { label: 'Limpar formatação', icon: <Eraser className={ic} />, onClick: () => clearSelection('formats') },
  ];
  const items = kind === 'row' ? [...base, ...rows, ...tail] : kind === 'col' ? [...base, ...cols, ...tail] : [...base, ...rows, { separator: true }, ...cols, ...tail];
  openMenu(x, y, items);
}
