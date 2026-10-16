// Modelo de dados da pasta de trabalho.

import { cellKey, keyCol, keyRow, Range } from './address';

export type Scalar = number | string | boolean | null;

export interface ErrorValue {
  err: string; // código canônico: #DIV/0!, #VALUE!, #REF!, #NAME?, #N/A, #NUM!, #CIRC!
}

export type Value = Scalar | ErrorValue;

export function isError(v: unknown): v is ErrorValue {
  return typeof v === 'object' && v !== null && 'err' in v;
}

export type NumFmt = 'general' | 'number' | 'currency' | 'percent' | 'date' | 'text';

export interface CellStyle {
  font?: string;
  size?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  color?: string; // #rrggbb
  fill?: string; // #rrggbb
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  fmt?: NumFmt;
  dec?: number; // casas decimais
  bt?: boolean; // borda superior
  bb?: boolean; // borda inferior
  bl?: boolean; // borda esquerda
  br?: boolean; // borda direita
  excelFmt?: string; // formato numérico original vindo de um .xlsx (preservado)
}

export interface Cell {
  v?: Scalar; // valor digitado (ou último valor calculado, para fórmulas importadas)
  f?: string; // fórmula canônica, sem "="
  s?: CellStyle;
}

export interface FilterState {
  headerRow: number;
  c1: number;
  c2: number;
  // coluna -> valores permitidos (texto exibido). Ausente = sem filtro na coluna.
  allowed: Record<number, string[]>;
}

export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_FONT = 'Segoe UI';
export const DEFAULT_SIZE = 11;

let sheetUidCounter = 1;

export class Sheet {
  uid: number; // identificador numérico interno (não é salvo)
  name: string;
  cells = new Map<number, Cell>();
  colWidths = new Map<number, number>();
  rowHeights = new Map<number, number>();
  hiddenRows = new Set<number>();
  freezeRows = 0;
  filter: FilterState | null = null;
  private usedCache: { rows: number; cols: number } | null = null;

  constructor(name: string) {
    this.uid = sheetUidCounter++;
    this.name = name;
  }

  get(row: number, col: number): Cell | undefined {
    return this.cells.get(cellKey(row, col));
  }

  /** Grava (ou remove, se vazia) uma célula. Use via Workbook para manter as fórmulas em dia. */
  rawSet(row: number, col: number, cell: Cell | undefined): void {
    const k = cellKey(row, col);
    if (!cell || (cell.v == null && cell.f == null && (!cell.s || Object.keys(cell.s).length === 0))) {
      this.cells.delete(k);
    } else {
      this.cells.set(k, cell);
    }
    this.usedCache = null;
  }

  touch(): void {
    this.usedCache = null;
  }

  /** Quantidade de linhas/colunas usadas (índice da última + 1). */
  used(): { rows: number; cols: number } {
    if (this.usedCache) return this.usedCache;
    let rows = 0;
    let cols = 0;
    for (const k of this.cells.keys()) {
      const r = keyRow(k) + 1;
      const c = keyCol(k) + 1;
      if (r > rows) rows = r;
      if (c > cols) cols = c;
    }
    this.usedCache = { rows, cols };
    return this.usedCache;
  }

  /** Igual a used(), mas ignora células que só têm estilo. */
  usedData(): { rows: number; cols: number } {
    let rows = 0;
    let cols = 0;
    for (const [k, c] of this.cells) {
      if (c.v == null && c.f == null) continue;
      const r = keyRow(k) + 1;
      const cc = keyCol(k) + 1;
      if (r > rows) rows = r;
      if (cc > cols) cols = cc;
    }
    return { rows, cols };
  }

  colWidth(c: number): number {
    return this.colWidths.get(c) ?? DEFAULT_COL_WIDTH;
  }

  rowHeight(r: number): number {
    if (this.hiddenRows.has(r)) return 0;
    return this.rowHeights.get(r) ?? DEFAULT_ROW_HEIGHT;
  }

  /** Percorre as células existentes dentro de um intervalo (ordem não garantida). */
  forEachIn(range: Range, cb: (row: number, col: number, cell: Cell) => void): void {
    const area = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (area > this.cells.size * 2) {
      for (const [k, cell] of this.cells) {
        const r = keyRow(k);
        const c = keyCol(k);
        if (r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2) cb(r, c, cell);
      }
    } else {
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) {
          const cell = this.cells.get(cellKey(r, c));
          if (cell) cb(r, c, cell);
        }
      }
    }
  }
}

export function cloneCell(c: Cell | undefined): Cell | undefined {
  if (!c) return undefined;
  const out: Cell = {};
  if (c.v !== undefined) out.v = c.v;
  if (c.f !== undefined) out.f = c.f;
  if (c.s) out.s = { ...c.s };
  return out;
}

// ---------- Serialização (JSON) — usada pela recuperação automática ----------

export interface SheetJSON {
  name: string;
  cells: [number, number, Cell][];
  colWidths: [number, number][];
  rowHeights: [number, number][];
  hiddenRows: number[];
  freezeRows: number;
  filter: FilterState | null;
}

export interface WorkbookJSON {
  format: 'excel-facil';
  version: 1;
  activeSheet: number;
  sheets: SheetJSON[];
}

export function sheetToJSON(s: Sheet): SheetJSON {
  const cells: [number, number, Cell][] = [];
  for (const [k, c] of s.cells) cells.push([keyRow(k), keyCol(k), c]);
  return {
    name: s.name,
    cells,
    colWidths: [...s.colWidths],
    rowHeights: [...s.rowHeights],
    hiddenRows: [...s.hiddenRows],
    freezeRows: s.freezeRows,
    filter: s.filter,
  };
}

export function sheetFromJSON(j: SheetJSON): Sheet {
  const s = new Sheet(String(j.name));
  for (const [r, c, cell] of j.cells ?? []) s.cells.set(cellKey(r, c), cell);
  for (const [c, w] of j.colWidths ?? []) s.colWidths.set(c, w);
  for (const [r, h] of j.rowHeights ?? []) s.rowHeights.set(r, h);
  for (const r of j.hiddenRows ?? []) s.hiddenRows.add(r);
  s.freezeRows = j.freezeRows ?? 0;
  s.filter = j.filter ?? null;
  return s;
}
