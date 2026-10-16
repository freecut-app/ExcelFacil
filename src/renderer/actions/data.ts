// Ações das guias Dados e Cálculos.

import { colToLetters, MAX_ROWS, Range, rangeToA1 } from '../../core/address';
import { clearAllFilters, detectRegion, disableFilter, enableFilter, sortRange } from '../../core/ops';
import { alertMsg } from '../dialogs';
import { currentSheet, getState, selRange, setState, toast } from '../store';
import { commitEdit, focusGrid, selectionOrRegion, setSel } from './editing';

function looksLikeHeader(r: Range): boolean {
  const s = getState();
  const sh = currentSheet()!;
  if (r.r2 <= r.r1) return false;
  let textTop = 0;
  let numBelow = 0;
  for (let c = r.c1; c <= r.c2; c++) {
    const top = s.wb!.value(sh, r.r1, c);
    const below = s.wb!.value(sh, r.r1 + 1, c);
    if (typeof top === 'string') textTop++;
    if (typeof below === 'number') numBelow++;
  }
  const bold = !!sh.get(r.r1, r.c1)?.s?.b;
  return bold || (textTop === r.c2 - r.c1 + 1 && (numBelow > 0 || r.c2 > r.c1));
}

/** Ordena a tabela pela coluna da célula ativa. */
export function sortSelection(asc: boolean): void {
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh || !commitEdit('none')) return;
  let region: Range;
  const sel = selRange(s.sel);
  const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
  if (sh.filter) {
    region = { r1: sh.filter.headerRow, c1: sh.filter.c1, r2: MAX_ROWS - 1, c2: sh.filter.c2 };
  } else if (single || sel.c1 === sel.c2) {
    region = detectRegion(sh, sel.r1, sel.c1);
  } else {
    region = selectionOrRegion();
  }
  const used = sh.usedData();
  if (!used.rows) {
    toast('Não há dados para ordenar.', 'info');
    return;
  }
  const header = sh.filter ? true : looksLikeHeader(region);
  const col = Math.min(Math.max(s.sel.ac, region.c1), region.c2);
  sortRange(s.wb, sh, region, col, asc, header);
  toast(`Ordenado pela coluna ${colToLetters(col)} (${asc ? 'A→Z, menor→maior' : 'Z→A, maior→menor'})${header ? ', mantendo o cabeçalho' : ''}.`, 'success', 3500);
  focusGrid();
}

export function toggleFilter(): void {
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh || !commitEdit('none')) return;
  if (sh.filter) {
    disableFilter(s.wb, sh);
    toast('Filtro removido. Todas as linhas aparecem.', 'info');
    return;
  }
  const sel = selRange(s.sel);
  let region = sel.r1 === sel.r2 && sel.c1 === sel.c2 ? detectRegion(sh, sel.r1, sel.c1) : selectionOrRegion();
  if (!sh.get(region.r1, region.c1) && region.r1 === region.r2) {
    void alertMsg('Selecione a tabela', 'Clique em uma célula da sua tabela (com cabeçalho na primeira linha) e use Filtro de novo.');
    return;
  }
  // Se a pessoa clicou numa linha de dados, procura o cabeçalho logo acima da região.
  if (region.r2 === region.r1 && region.r1 > 0) region = { ...region, r1: region.r1 - 1 };
  enableFilter(s.wb, sh, region);
  toast('Filtro ativado. Clique nas setinhas do cabeçalho para escolher o que mostrar.', 'success', 4500);
  focusGrid();
}

export function showAllRows(): void {
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh) return;
  clearAllFilters(s.wb, sh);
}

/** Σ: insere SOMA logo abaixo (ou à direita) da seleção. */
export function autoSum(fn: 'SOMA' | 'MÉDIA' | 'MÁXIMO' | 'MÍNIMO' | 'CONT.NÚM' = 'SOMA'): void {
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh || !commitEdit('none')) return;
  let rg = selRange(s.sel);
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) {
    // Uma célula: soma os números acima dela.
    const c = rg.c1;
    let r = rg.r1 - 1;
    while (r >= 0 && typeof s.wb.value(sh, r, c) !== 'number') r--;
    const end = r;
    while (r >= 0 && typeof s.wb.value(sh, r, c) === 'number') r--;
    if (end < 0) {
      toast('Não encontrei números acima desta célula. Selecione os números e clique em Soma.', 'info', 4500);
      return;
    }
    s.wb.setInput(sh, rg.r1, c, `=${fn}(${rangeToA1({ r1: r + 1, c1: c, r2: end, c2: c })})`);
    setSel({ ar: rg.r1, ac: c, fr: rg.r1, fc: c });
    return;
  }
  const u = sh.usedData();
  rg = { ...rg, r2: Math.min(rg.r2, Math.max(rg.r1, u.rows - 1)), c2: Math.min(rg.c2, Math.max(rg.c1, u.cols - 1)) };
  const items: { row: number; col: number; f: string }[] = [];
  if (rg.r1 === rg.r2) {
    items.push({ row: rg.r1, col: rg.c2 + 1, f: `${fn}(${rangeToA1(rg)})` });
  } else {
    for (let c = rg.c1; c <= rg.c2; c++) items.push({ row: rg.r2 + 1, col: c, f: `${fn}(${rangeToA1({ r1: rg.r1, c1: c, r2: rg.r2, c2: c })})` });
  }
  s.wb.transact('Soma automática', () => {
    for (const it of items) s.wb!.setInput(sh, it.row, it.col, '=' + it.f);
  });
  const last = items[items.length - 1];
  setSel({ ar: items[0].row, ac: items[0].col, fr: last.row, fc: last.col });
}

export function openQuick(op: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'pct'): void {
  if (!commitEdit('none')) return;
  setState({ panel: { type: 'quick', op } });
}
