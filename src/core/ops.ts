// Operações de dados: ordenar, filtrar, localizar/substituir, remover duplicados,
// preencher, copiar/colar e estatísticas da seleção.

import { cellKey, keyCol, keyRow, MAX_COLS, MAX_ROWS, normRange, Range } from './address';
import { formatValue, parseNumberBR } from './format';
import { compareValues } from './formula/evaluator';
import { moveRefsInFormula, shiftFormula } from './formula/refs';
import { Cell, cloneCell, isError, Sheet, Value } from './model';
import { Workbook } from './workbook';

// ---------- estatísticas da seleção ----------

export interface SelectionStats {
  sum: number;
  count: number; // números
  countA: number; // não vazias
  min: number | null;
  max: number | null;
  avg: number | null;
}

export function selectionStats(wb: Workbook, sheet: Sheet, ranges: Range[]): SelectionStats {
  let sum = 0;
  let count = 0;
  let countA = 0;
  let min: number | null = null;
  let max: number | null = null;
  const seen = new Set<number>();
  for (const rg of ranges) {
    const r = normRange(rg);
    sheet.forEachIn(r, (row, col) => {
      const k = cellKey(row, col);
      if (seen.has(k) || sheet.hiddenRows.has(row)) return;
      seen.add(k);
      const v = wb.value(sheet, row, col);
      if (v === null || v === '') return;
      countA++;
      if (typeof v === 'number') {
        sum += v;
        count++;
        if (min === null || v < min) min = v;
        if (max === null || v > max) max = v;
      }
    });
  }
  return { sum, count, countA, min, max, avg: count ? sum / count : null };
}

// ---------- texto exibido ----------

export function displayText(wb: Workbook, sheet: Sheet, row: number, col: number): string {
  const c = sheet.get(row, col);
  return formatValue(wb.value(sheet, row, col), c?.s);
}

// ---------- ordenação ----------

/**
 * Ordena as linhas de um intervalo pela coluna `byCol`.
 * Vazios ficam sempre no fim. Fórmulas são ajustadas à nova linha.
 */
export function sortRange(wb: Workbook, sheet: Sheet, range: Range, byCol: number, asc: boolean, hasHeader: boolean): void {
  const rg = normRange(range);
  const start = hasHeader ? rg.r1 + 1 : rg.r1;
  const used = sheet.usedData();
  const end = Math.min(rg.r2, used.rows - 1);
  const c2 = Math.min(rg.c2, Math.max(used.cols - 1, rg.c1));
  if (end <= start) return;
  const rows: { r: number; key: Value }[] = [];
  for (let r = start; r <= end; r++) {
    if (sheet.hiddenRows.has(r)) continue;
    rows.push({ r, key: wb.value(sheet, r, byCol) });
  }
  const sorted = [...rows].sort((a, b) => {
    const ea = a.key === null || a.key === '';
    const eb = b.key === null || b.key === '';
    if (ea || eb) return ea === eb ? a.r - b.r : ea ? 1 : -1;
    if (isError(a.key) || isError(b.key)) return isError(a.key) === isError(b.key) ? a.r - b.r : isError(a.key) ? 1 : -1;
    const c = compareValues(a.key, b.key);
    return (asc ? c : -c) || a.r - b.r;
  });
  const items: { row: number; col: number; cell: Cell | undefined }[] = [];
  sorted.forEach((src, i) => {
    const dst = rows[i].r;
    for (let c = rg.c1; c <= c2; c++) {
      const cell = sheet.get(src.r, c);
      let nc = cell;
      if (cell?.f != null && dst !== src.r) nc = { ...cell, f: shiftFormula(cell.f, dst - src.r, 0) };
      items.push({ row: dst, col: c, cell: nc });
    }
  });
  wb.setCells(sheet, items, asc ? 'Ordenar crescente' : 'Ordenar decrescente');
}

// ---------- filtros ----------

export const BLANK_LABEL = '(Vazias)';

/** Detecta a "tabela" ao redor de uma célula (região contínua com dados). */
export function detectRegion(sheet: Sheet, row: number, col: number): Range {
  const has = (r: number, c: number) => {
    const x = sheet.get(r, c);
    return !!x && (x.v != null || x.f != null);
  };
  let r1 = row;
  let r2 = row;
  let c1 = col;
  let c2 = col;
  let grew = true;
  const used = sheet.used();
  while (grew) {
    grew = false;
    const rowHas = (r: number) => {
      for (let c = c1; c <= c2; c++) if (has(r, c)) return true;
      return false;
    };
    const colHas = (c: number) => {
      for (let r = r1; r <= r2; r++) if (has(r, c)) return true;
      return false;
    };
    if (r1 > 0 && rowHas(r1 - 1)) {
      r1--;
      grew = true;
    }
    if (r2 + 1 < used.rows && rowHas(r2 + 1)) {
      r2++;
      grew = true;
    }
    if (c1 > 0 && colHas(c1 - 1)) {
      c1--;
      grew = true;
    }
    if (c2 + 1 < used.cols && colHas(c2 + 1)) {
      c2++;
      grew = true;
    }
  }
  return { r1, c1, r2, c2 };
}

export function filterLastRow(sheet: Sheet): number {
  return Math.max(sheet.usedData().rows - 1, sheet.filter ? sheet.filter.headerRow : 0);
}

/** Valores distintos (texto exibido) de uma coluna abaixo do cabeçalho do filtro. */
export function distinctValues(wb: Workbook, sheet: Sheet, col: number): string[] {
  const f = sheet.filter;
  if (!f) return [];
  const set = new Set<string>();
  const last = filterLastRow(sheet);
  for (let r = f.headerRow + 1; r <= last; r++) {
    const t = displayText(wb, sheet, r, col);
    set.add(t === '' ? BLANK_LABEL : t);
  }
  return [...set].sort((a, b) => {
    if (a === BLANK_LABEL) return 1;
    if (b === BLANK_LABEL) return -1;
    const na = parseNumberBR(a.replace(/^R\$\s*/, '').replace(/%$/, ''));
    const nb = parseNumberBR(b.replace(/^R\$\s*/, '').replace(/%$/, ''));
    if (na !== null && nb !== null) return na - nb;
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
  });
}

/** Recalcula quais linhas ficam escondidas pelo filtro. */
export function applyFilter(wb: Workbook, sheet: Sheet): void {
  const f = sheet.filter;
  const hidden = new Set<number>();
  if (f) {
    const last = filterLastRow(sheet);
    const cols = Object.keys(f.allowed).map(Number);
    const sets = new Map(cols.map((c) => [c, new Set(f.allowed[c])]));
    for (let r = f.headerRow + 1; r <= last; r++) {
      for (const c of cols) {
        let t = displayText(wb, sheet, r, c);
        if (t === '') t = BLANK_LABEL;
        if (!sets.get(c)!.has(t)) {
          hidden.add(r);
          break;
        }
      }
    }
  }
  sheet.hiddenRows = hidden;
}

export function enableFilter(wb: Workbook, sheet: Sheet, region: Range): void {
  wb.meta('Ativar filtro', () => {
    sheet.filter = { headerRow: region.r1, c1: region.c1, c2: region.c2, allowed: {} };
    sheet.hiddenRows = new Set();
  });
}

export function disableFilter(wb: Workbook, sheet: Sheet): void {
  wb.meta('Remover filtro', () => {
    sheet.filter = null;
    sheet.hiddenRows = new Set();
  });
}

export function setColumnFilter(wb: Workbook, sheet: Sheet, col: number, allowed: string[] | null): void {
  wb.meta(allowed ? 'Filtrar' : 'Limpar filtro', () => {
    if (!sheet.filter) return;
    if (allowed) sheet.filter.allowed[col] = allowed;
    else delete sheet.filter.allowed[col];
    applyFilter(wb, sheet);
  });
}

export function clearAllFilters(wb: Workbook, sheet: Sheet): void {
  wb.meta('Mostrar tudo', () => {
    if (sheet.filter) sheet.filter.allowed = {};
    sheet.hiddenRows = new Set();
  });
}

// ---------- localizar e substituir ----------

export interface FindOptions {
  matchCase?: boolean;
  wholeCell?: boolean;
  allSheets?: boolean;
  inFormulas?: boolean;
}

export interface FindHit {
  sheet: Sheet;
  row: number;
  col: number;
}

export function findAll(wb: Workbook, current: Sheet, query: string, opts: FindOptions = {}): FindHit[] {
  if (!query) return [];
  const q = opts.matchCase ? query : query.toLocaleLowerCase('pt-BR');
  const hits: FindHit[] = [];
  const sheets = opts.allSheets ? wb.sheets : [current];
  for (const s of sheets) {
    const keys = [...s.cells.keys()].sort((a, b) => a - b);
    for (const k of keys) {
      const r = keyRow(k);
      const c = keyCol(k);
      const cell = s.cells.get(k)!;
      if (cell.v == null && cell.f == null) continue;
      let text = opts.inFormulas && cell.f != null ? wb.editText(s, r, c) : displayText(wb, s, r, c);
      if (!opts.matchCase) text = text.toLocaleLowerCase('pt-BR');
      if (opts.wholeCell ? text === q : text.includes(q)) hits.push({ sheet: s, row: r, col: c });
    }
  }
  return hits;
}

function replaceText(text: string, query: string, repl: string, opts: FindOptions): string {
  if (opts.wholeCell) {
    const eq = opts.matchCase ? text === query : text.toLocaleLowerCase('pt-BR') === query.toLocaleLowerCase('pt-BR');
    return eq ? repl : text;
  }
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.matchCase ? 'g' : 'gi');
  return text.replace(re, () => repl);
}

/** Substitui nos valores digitados (fórmulas não são alteradas). Devolve quantas células mudaram. */
export function replaceAll(wb: Workbook, current: Sheet, query: string, repl: string, opts: FindOptions = {}, only?: FindHit[]): number {
  const hits = only ?? findAll(wb, current, query, { ...opts, inFormulas: false });
  const bySheet = new Map<Sheet, { row: number; col: number; cell: Cell | undefined }[]>();
  for (const h of hits) {
    const cell = h.sheet.get(h.row, h.col);
    if (!cell || cell.f != null) continue;
    const old = wb.editText(h.sheet, h.row, h.col);
    const nt = replaceText(old, query, repl, opts);
    if (nt === old) continue;
    const nc = wb.cellFromInput(h.sheet, h.row, h.col, nt);
    let list = bySheet.get(h.sheet);
    if (!list) bySheet.set(h.sheet, (list = []));
    list.push({ row: h.row, col: h.col, cell: nc });
  }
  let n = 0;
  wb.transact('Substituir', () => {
    for (const [s, items] of bySheet) {
      wb.setCells(s, items, 'Substituir');
      n += items.length;
    }
  });
  return n;
}

// ---------- remover duplicados ----------

/** Remove linhas repetidas dentro do intervalo (comparando as colunas `cols`). Devolve quantas saíram. */
export function removeDuplicates(wb: Workbook, sheet: Sheet, range: Range, cols: number[], hasHeader: boolean): number {
  const rg = normRange(range);
  const start = hasHeader ? rg.r1 + 1 : rg.r1;
  const end = Math.min(rg.r2, sheet.usedData().rows - 1);
  if (end < start || !cols.length) return 0;
  const seen = new Set<string>();
  const keep: number[] = [];
  for (let r = start; r <= end; r++) {
    const key = cols
      .map((c) => {
        const v = wb.value(sheet, r, c);
        if (v === null) return '\u0000';
        if (isError(v)) return '#' + v.err;
        return typeof v + ':' + (typeof v === 'string' ? v.toLocaleLowerCase('pt-BR') : String(v));
      })
      .join('\u0001');
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(r);
  }
  const removed = end - start + 1 - keep.length;
  if (!removed) return 0;
  const items: { row: number; col: number; cell: Cell | undefined }[] = [];
  for (let i = 0; i <= end - start; i++) {
    const dst = start + i;
    const src = keep[i];
    for (let c = rg.c1; c <= rg.c2; c++) {
      if (src === undefined) {
        items.push({ row: dst, col: c, cell: undefined });
        continue;
      }
      const cell = sheet.get(src, c);
      items.push({ row: dst, col: c, cell: cell?.f != null && src !== dst ? { ...cell, f: shiftFormula(cell.f, dst - src, 0) } : cell });
    }
  }
  wb.setCells(sheet, items, 'Remover duplicados');
  return removed;
}

// ---------- preencher (alça de preenchimento / Ctrl+D) ----------

/** Estende o conteúdo de `src` até cobrir `dst` (que contém `src`). */
export function fillRange(wb: Workbook, sheet: Sheet, src: Range, dst: Range): void {
  const s = normRange(src);
  const d = normRange(dst);
  const items: { row: number; col: number; cell: Cell | undefined }[] = [];
  const vertical = d.r1 !== s.r1 || d.r2 !== s.r2;
  const srcH = s.r2 - s.r1 + 1;
  const srcW = s.c2 - s.c1 + 1;

  const series = (cells: (Cell | undefined)[]): ((i: number) => Cell | undefined) | null => {
    // Série numérica (1, 2 -> 3, 4...) quando há 2+ números sem fórmula.
    if (cells.length < 2) return null;
    const nums = cells.map((c) => (c && c.f == null && typeof c.v === 'number' ? c.v : null));
    if (nums.some((n) => n === null)) return null;
    const step = (nums[nums.length - 1]! - nums[0]!) / (nums.length - 1);
    for (let i = 1; i < nums.length; i++) if (Math.abs(nums[i]! - nums[i - 1]! - step) > 1e-9) return null;
    const base = nums[0]!;
    const style = cells[cells.length - 1]?.s;
    return (i) => ({ v: parseFloat((base + step * i).toPrecision(15)), ...(style ? { s: style } : {}) });
  };

  if (vertical) {
    for (let c = d.c1; c <= d.c2; c++) {
      const col = s.c1 + ((((c - d.c1) % srcW) + srcW) % srcW);
      const srcCells = Array.from({ length: srcH }, (_, i) => sheet.get(s.r1 + i, col));
      const ser = series(srcCells);
      for (let r = d.r1; r <= d.r2; r++) {
        if (r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2) continue;
        const off = r - s.r1;
        const idx = ((off % srcH) + srcH) % srcH;
        const from = srcCells[idx];
        let cell = ser ? ser(off) : cloneCell(from);
        if (!ser && from?.f != null) cell = { ...from, f: shiftFormula(from.f, r - (s.r1 + idx), c - col) };
        items.push({ row: r, col: c, cell });
      }
    }
  } else {
    for (let r = d.r1; r <= d.r2; r++) {
      const row = s.r1 + ((((r - d.r1) % srcH) + srcH) % srcH);
      const srcCells = Array.from({ length: srcW }, (_, i) => sheet.get(row, s.c1 + i));
      const ser = series(srcCells);
      for (let c = d.c1; c <= d.c2; c++) {
        if (c >= s.c1 && c <= s.c2 && r >= s.r1 && r <= s.r2) continue;
        const off = c - s.c1;
        const idx = ((off % srcW) + srcW) % srcW;
        const from = srcCells[idx];
        let cell = ser ? ser(off) : cloneCell(from);
        if (!ser && from?.f != null) cell = { ...from, f: shiftFormula(from.f, r - row, c - (s.c1 + idx)) };
        items.push({ row: r, col: c, cell });
      }
    }
  }
  wb.setCells(sheet, items, 'Preencher');
}

// ---------- área de transferência ----------

export interface ClipData {
  sheetUid: number;
  sheetName: string;
  range: Range;
  cells: (Cell | undefined)[][];
  text: string; // texto gerado na cópia (para saber se o sistema ainda tem o nosso conteúdo)
  cut: boolean;
}

export function serializeTSV(grid: string[][]): string {
  return grid
    .map((row) =>
      row
        .map((t) => (/[\t\n"\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t))
        .join('\t'),
    )
    .join('\r\n');
}

export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let i = 0;
  let quoted = false;
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  while (i < t.length) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"' && cur === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function copyRange(wb: Workbook, sheet: Sheet, range: Range, cut: boolean): { clip: ClipData; html: string } {
  const rg = normRange(range);
  const used = sheet.used();
  const r2 = Math.min(rg.r2, Math.max(rg.r1, used.rows - 1));
  const c2 = Math.min(rg.c2, Math.max(rg.c1, used.cols - 1));
  const cells: (Cell | undefined)[][] = [];
  const text: string[][] = [];
  for (let r = rg.r1; r <= r2; r++) {
    if (sheet.hiddenRows.has(r) && !cut) continue;
    const row: (Cell | undefined)[] = [];
    const trow: string[] = [];
    for (let c = rg.c1; c <= c2; c++) {
      row.push(sheet.get(r, c));
      trow.push(displayText(wb, sheet, r, c));
    }
    cells.push(row);
    text.push(trow);
  }
  const html =
    '<table>' +
    text.map((row) => '<tr>' + row.map((t) => '<td>' + escapeHtml(t) + '</td>').join('') + '</tr>').join('') +
    '</table>';
  return {
    clip: { sheetUid: sheet.uid, sheetName: sheet.name, range: { r1: rg.r1, c1: rg.c1, r2, c2 }, cells, text: serializeTSV(text), cut },
    html,
  };
}

export type PasteMode = 'all' | 'values' | 'formats';

/** Cola dados copiados do próprio Excel Fácil. Devolve o intervalo colado. */
export function pasteClip(wb: Workbook, sheet: Sheet, target: Range, clip: ClipData, mode: PasteMode = 'all'): Range {
  const t = normRange(target);
  const h = clip.cells.length;
  const w = clip.cells[0]?.length ?? 0;
  if (!h || !w) return t;
  // Se a seleção for múltipla do tamanho copiado, repete o bloco.
  const th = t.r2 - t.r1 + 1;
  const tw = t.c2 - t.c1 + 1;
  const reps = !clip.cut && th % h === 0 && tw % w === 0 ? [th / h, tw / w] : [1, 1];
  const out: Range = { r1: t.r1, c1: t.c1, r2: Math.min(MAX_ROWS - 1, t.r1 + h * reps[0] - 1), c2: Math.min(MAX_COLS - 1, t.c1 + w * reps[1] - 1) };
  const srcSheet = wb.sheets.find((s) => s.uid === clip.sheetUid) ?? null;

  wb.transact(clip.cut ? 'Recortar e colar' : 'Colar', () => {
    const items: { row: number; col: number; cell: Cell | undefined }[] = [];
    for (let rr = 0; rr < reps[0]; rr++)
      for (let cc = 0; cc < reps[1]; cc++)
        for (let i = 0; i < h; i++)
          for (let j = 0; j < w; j++) {
            const row = t.r1 + rr * h + i;
            const col = t.c1 + cc * w + j;
            if (row >= MAX_ROWS || col >= MAX_COLS) continue;
            const src = clip.cells[i][j];
            const existing = sheet.get(row, col);
            let cell: Cell | undefined;
            if (mode === 'formats') {
              cell = { ...(existing ?? {}) };
              if (src?.s) cell.s = { ...src.s };
              else delete cell.s;
            } else if (mode === 'values') {
              const v = srcSheet ? wb.value(srcSheet, clip.range.r1 + i, clip.range.c1 + j) : (src?.v ?? null);
              cell = { ...(existing?.s ? { s: existing.s } : {}) };
              if (v !== null && !isError(v)) cell.v = v;
            } else {
              cell = cloneCell(src);
              if (cell?.f != null && !clip.cut) {
                cell.f = shiftFormula(cell.f, row - (clip.range.r1 + i), col - (clip.range.c1 + j));
              }
            }
            items.push({ row, col, cell });
          }

    if (clip.cut && srcSheet) {
      // Limpa a origem (o que não foi sobrescrito pelo destino).
      const dstKeys = new Set(items.map((it) => cellKey(it.row, it.col)));
      const clears: { row: number; col: number; cell: undefined }[] = [];
      for (let i = 0; i < h; i++)
        for (let j = 0; j < w; j++) {
          const r = clip.range.r1 + i;
          const c = clip.range.c1 + j;
          if (srcSheet !== sheet || !dstKeys.has(cellKey(r, c))) clears.push({ row: r, col: c, cell: undefined });
        }
      wb.setCells(srcSheet, clears);
      // Fórmulas de fora que apontavam para o bloco movido passam a apontar para o destino.
      const dr = t.r1 - clip.range.r1;
      const dc = t.c1 - clip.range.c1;
      for (const s of wb.sheets) {
        const upd: { row: number; col: number; cell: Cell }[] = [];
        for (const [k, c] of s.cells) {
          if (c.f == null) continue;
          const nf = moveRefsInFormula(c.f, s.name, srcSheet.name, clip.range, sheet.name, dr, dc);
          if (nf !== c.f) upd.push({ row: keyRow(k), col: keyCol(k), cell: { ...c, f: nf } });
        }
        if (upd.length) wb.setCells(s, upd);
      }
      // Também as fórmulas que vieram no bloco e se referiam a ele mesmo.
      const moved: { row: number; col: number; cell: Cell }[] = [];
      for (const it of items) {
        if (!it.cell?.f) continue;
        const nf = moveRefsInFormula(it.cell.f, sheet.name, srcSheet.name, clip.range, sheet.name, dr, dc);
        if (nf !== it.cell.f) moved.push({ row: it.row, col: it.col, cell: { ...it.cell, f: nf } });
      }
      wb.setCells(sheet, items);
      if (moved.length) wb.setCells(sheet, moved);
    } else {
      wb.setCells(sheet, items);
    }
  });
  return out;
}

/** Cola texto vindo de outro programa (tabulações e quebras de linha). */
export function pasteText(wb: Workbook, sheet: Sheet, target: Range, text: string): Range {
  const t = normRange(target);
  const grid = parseTSV(text);
  const items: { row: number; col: number; cell: Cell | undefined }[] = [];
  let maxW = 0;
  grid.forEach((row, i) => {
    maxW = Math.max(maxW, row.length);
    row.forEach((val, j) => {
      const r = t.r1 + i;
      const c = t.c1 + j;
      if (r >= MAX_ROWS || c >= MAX_COLS) return;
      let cell: Cell | undefined;
      try {
        cell = wb.cellFromInput(sheet, r, c, val);
      } catch {
        cell = { v: val }; // fórmula inválida vinda de fora: cola como texto
      }
      items.push({ row: r, col: c, cell });
    });
  });
  wb.setCells(sheet, items, 'Colar');
  return { r1: t.r1, c1: t.c1, r2: t.r1 + grid.length - 1, c2: t.c1 + Math.max(0, maxW - 1) };
}
