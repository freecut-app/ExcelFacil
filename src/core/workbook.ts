// Pasta de trabalho: abas + motor de fórmulas + histórico (desfazer/refazer).
// Regra importante: objetos Cell nunca são alterados no lugar — sempre substituídos.
// Isso permite que o histórico guarde referências sem copiar dados.

import { cellKey, keyCol, keyRow, MAX_COLS, MAX_ROWS, Range } from './address';
import { Engine } from './engine';
import { editTextForValue, parseInput } from './format';
import { fromDisplay, toDisplay } from './formula/locale';
import { parseFormula } from './formula/parser';
import { adjustFormula, removeSheetInFormula, renameSheetInFormula, StructOp } from './formula/refs';
import { FormulaSyntaxError } from './formula/tokenizer';
import {
  Cell,
  CellStyle,
  FilterState,
  Sheet,
  sheetFromJSON,
  sheetToJSON,
  Value,
  WorkbookJSON,
} from './model';

interface CellPatch {
  uid: number;
  key: number;
  before: Cell | undefined;
  after: Cell | undefined;
}

interface SheetSnap {
  uid: number;
  name: string;
  cells: Map<number, Cell>;
  colWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  hiddenRows: Set<number>;
  freezeRows: number;
  filter: FilterState | null;
}

export interface HistoryEntry {
  label: string;
  patches: CellPatch[];
  snapBefore?: SheetSnap[];
  snapAfter?: SheetSnap[];
  prePatches?: CellPatch[]; // alterações de células feitas antes da foto (mesma ação)
  meta?: unknown; // seleção etc. (definida pela interface)
  metaAfter?: unknown;
}

const HISTORY_LIMIT = 300;

export class InputError extends Error {}

export class Workbook {
  sheets: Sheet[] = [];
  engine: Engine;
  rev = 0;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private recording: {
    label: string;
    patches: Map<string, CellPatch>;
    snap?: SheetSnap[];
    prePatches?: CellPatch[];
    meta?: unknown;
  } | null = null;
  private listeners = new Set<() => void>();

  constructor(sheetNames: string[] = ['Planilha1']) {
    for (const n of sheetNames) this.sheets.push(new Sheet(n));
    this.engine = new Engine({
      sheets: () => this.sheets,
      byName: (name) => this.sheetByName(name),
      byUid: (uid) => this.sheets.find((s) => s.uid === uid) ?? null,
    });
  }

  // ---------- notificações ----------

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    this.rev++;
    for (const l of this.listeners) l();
  }

  // ---------- acesso ----------

  sheetByName(name: string): Sheet | null {
    const low = name.toLowerCase();
    return this.sheets.find((s) => s.name.toLowerCase() === low) ?? null;
  }

  value(sheet: Sheet, row: number, col: number): Value {
    return this.engine.cellValue(sheet, row, col);
  }

  /** Texto para a barra de fórmulas / edição. */
  editText(sheet: Sheet, row: number, col: number): string {
    const c = sheet.get(row, col);
    if (!c) return '';
    if (c.f != null) return '=' + toDisplay(c.f);
    return editTextForValue(c.v, c.s);
  }

  // ---------- histórico ----------

  /** Agrupa alterações numa única ação de desfazer. */
  transact<T>(label: string, fn: () => T, meta?: unknown): T {
    if (this.recording) return fn();
    this.recording = { label, patches: new Map(), meta };
    let result: T;
    try {
      result = fn();
    } finally {
      const rec = this.recording!;
      this.recording = null;
      const patches = [...rec.patches.values()].filter((p) => p.before !== p.after);
      if (patches.length || rec.snap) {
        const entry: HistoryEntry = { label: rec.label, patches, meta: rec.meta };
        if (rec.snap) {
          entry.snapBefore = rec.snap;
          entry.snapAfter = this.snapshot();
          entry.prePatches = rec.prePatches;
        }
        this.undoStack.push(entry);
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
        this.redoStack = [];
        this.changed();
      }
    }
    return result!;
  }

  /** Para operações estruturais: guarda uma foto completa antes de alterar. */
  private structural<T>(label: string, fn: () => T, meta?: unknown): T {
    return this.transact(
      label,
      () => {
        if (this.recording && !this.recording.snap) {
          this.recording.snap = this.snapshot();
          this.recording.prePatches = [...this.recording.patches.values()].map((p) => ({ ...p }));
        }
        const r = fn();
        this.engine.rebuild();
        return r;
      },
      meta,
    );
  }

  private snapshot(): SheetSnap[] {
    return this.sheets.map((s) => ({
      uid: s.uid,
      name: s.name,
      cells: new Map(s.cells),
      colWidths: new Map(s.colWidths),
      rowHeights: new Map(s.rowHeights),
      hiddenRows: new Set(s.hiddenRows),
      freezeRows: s.freezeRows,
      filter: s.filter ? structuredClone(s.filter) : null,
    }));
  }

  private restore(snap: SheetSnap[]): void {
    const byUid = new Map(this.sheets.map((s) => [s.uid, s]));
    this.sheets = snap.map((sn) => {
      const s = byUid.get(sn.uid) ?? new Sheet(sn.name);
      s.uid = sn.uid;
      s.name = sn.name;
      s.cells = new Map(sn.cells);
      s.colWidths = new Map(sn.colWidths);
      s.rowHeights = new Map(sn.rowHeights);
      s.hiddenRows = new Set(sn.hiddenRows);
      s.freezeRows = sn.freezeRows;
      s.filter = sn.filter ? structuredClone(sn.filter) : null;
      s.touch();
      return s;
    });
    this.engine.rebuild();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }
  redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  undo(): HistoryEntry | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    if (e.snapBefore) {
      this.restore(e.snapBefore);
      if (e.prePatches?.length) this.applyPatches(e.prePatches, 'before');
    } else this.applyPatches(e.patches, 'before');
    this.redoStack.push(e);
    this.changed();
    return e;
  }

  redo(): HistoryEntry | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    if (e.snapAfter) this.restore(e.snapAfter);
    else this.applyPatches(e.patches, 'after');
    this.undoStack.push(e);
    this.changed();
    return e;
  }

  private applyPatches(patches: CellPatch[], which: 'before' | 'after'): void {
    const bySheet = new Map<number, number[]>();
    for (const p of patches) {
      const s = this.sheets.find((x) => x.uid === p.uid);
      if (!s) continue;
      const c = p[which];
      if (c) s.cells.set(p.key, c);
      else s.cells.delete(p.key);
      s.touch();
      let list = bySheet.get(p.uid);
      if (!list) bySheet.set(p.uid, (list = []));
      list.push(p.key);
    }
    for (const [uid, keys] of bySheet) {
      const s = this.sheets.find((x) => x.uid === uid)!;
      this.engine.cellsChanged(s, keys);
    }
  }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  // ---------- alteração de células ----------

  private record(sheet: Sheet, key: number, before: Cell | undefined, after: Cell | undefined): void {
    if (!this.recording) return;
    const id = sheet.uid + ':' + key;
    const p = this.recording.patches.get(id);
    if (p) p.after = after;
    else this.recording.patches.set(id, { uid: sheet.uid, key, before, after });
  }

  /** Grava várias células de uma vez (uma ação de desfazer). */
  setCells(sheet: Sheet, items: { row: number; col: number; cell: Cell | undefined }[], label = 'Editar células'): void {
    if (!items.length) return;
    this.transact(label, () => {
      const keys: number[] = [];
      for (const it of items) {
        if (it.row < 0 || it.col < 0 || it.row >= MAX_ROWS || it.col >= MAX_COLS) continue;
        const key = cellKey(it.row, it.col);
        const before = sheet.cells.get(key);
        sheet.rawSet(it.row, it.col, it.cell);
        const after = sheet.cells.get(key);
        this.record(sheet, key, before, after);
        keys.push(key);
      }
      this.engine.cellsChanged(sheet, keys);
    });
  }

  setCell(sheet: Sheet, row: number, col: number, cell: Cell | undefined, label?: string): void {
    this.setCells(sheet, [{ row, col, cell }], label);
  }

  /**
   * Converte o texto digitado pela pessoa numa célula (sem gravar).
   * Lança InputError com mensagem amigável se a fórmula estiver errada.
   */
  cellFromInput(sheet: Sheet, row: number, col: number, text: string): Cell | undefined {
    const old = sheet.get(row, col);
    const p = parseInput(text, old?.s);
    const s: CellStyle | undefined = old?.s ? { ...old.s } : undefined;
    if (p.f !== undefined) {
      let canonical: string;
      try {
        canonical = fromDisplay(p.f);
        parseFormula(canonical);
      } catch (e) {
        if (e instanceof FormulaSyntaxError) throw new InputError(e.message);
        throw e;
      }
      return { f: canonical, ...(s ? { s } : {}) };
    }
    let style = s;
    // "R$ 10", "15%" ou "16/10/2026" já trazem o formato junto com o valor.
    if (p.fmt && style?.fmt !== p.fmt) {
      style = { ...(style ?? {}), fmt: p.fmt };
      if (p.dec !== undefined) style.dec = p.dec;
      else delete style.dec;
    }
    if (p.v === null) return style ? { s: style } : undefined;
    return { v: p.v, ...(style ? { s: style } : {}) };
  }

  setInput(sheet: Sheet, row: number, col: number, text: string): void {
    this.setCell(sheet, row, col, this.cellFromInput(sheet, row, col, text), 'Digitar');
  }

  /** Aplica estilo a um intervalo. */
  applyStyle(sheet: Sheet, range: Range, patch: Partial<CellStyle> | ((s: CellStyle, row: number, col: number) => CellStyle), label = 'Formatar'): void {
    const items: { row: number; col: number; cell: Cell | undefined }[] = [];
    const rg = this.clampToUsedForStyle(sheet, range);
    for (let r = rg.r1; r <= rg.r2; r++) {
      for (let c = rg.c1; c <= rg.c2; c++) {
        const old = sheet.get(r, c);
        const base = old?.s ?? {};
        let ns: CellStyle = typeof patch === 'function' ? patch({ ...base }, r, c) : { ...base, ...patch };
        ns = Object.fromEntries(Object.entries(ns).filter(([, v]) => v !== undefined && v !== false && v !== null)) as CellStyle;
        if (ns.fmt === 'general') delete ns.fmt;
        const cell: Cell = { ...(old ?? {}) };
        if (Object.keys(ns).length) cell.s = ns;
        else delete cell.s;
        items.push({ row: r, col: c, cell });
      }
    }
    this.setCells(sheet, items, label);
  }

  /** Para seleções de coluna/linha inteira, aplica o estilo só até a área usada (+ folga). */
  clampToUsedForStyle(sheet: Sheet, range: Range): Range {
    const u = sheet.used();
    const maxR = Math.max(u.rows + 50, 200);
    const maxC = Math.max(u.cols + 10, 30);
    return { r1: range.r1, c1: range.c1, r2: Math.min(range.r2, Math.max(range.r1, maxR)), c2: Math.min(range.c2, Math.max(range.c1, maxC)) };
  }

  clearRange(sheet: Sheet, range: Range, what: 'all' | 'contents' | 'formats' = 'contents'): void {
    const items: { row: number; col: number; cell: Cell | undefined }[] = [];
    sheet.forEachIn(range, (r, c, cell) => {
      if (what === 'all') items.push({ row: r, col: c, cell: undefined });
      else if (what === 'contents') items.push({ row: r, col: c, cell: cell.s ? { s: cell.s } : undefined });
      else {
        const n: Cell = { ...cell };
        delete n.s;
        items.push({ row: r, col: c, cell: n });
      }
    });
    this.setCells(sheet, items, what === 'formats' ? 'Limpar formatação' : 'Apagar');
  }

  // ---------- tamanho de linhas e colunas ----------

  setColWidth(sheet: Sheet, cols: number[], width: number | null): void {
    this.structural('Largura da coluna', () => {
      for (const c of cols) {
        if (width === null) sheet.colWidths.delete(c);
        else sheet.colWidths.set(c, Math.max(16, Math.min(1200, Math.round(width))));
      }
    });
  }

  setRowHeight(sheet: Sheet, rows: number[], height: number | null): void {
    this.structural('Altura da linha', () => {
      for (const r of rows) {
        if (height === null) sheet.rowHeights.delete(r);
        else sheet.rowHeights.set(r, Math.max(12, Math.min(600, Math.round(height))));
      }
    });
  }

  setFreezeRows(sheet: Sheet, n: number): void {
    this.structural(n ? 'Congelar linha' : 'Descongelar', () => {
      sheet.freezeRows = n;
    });
  }

  /** Executa uma alteração qualquer de "metadados" com desfazer (usada por filtros etc.). */
  meta<T>(label: string, fn: () => T): T {
    return this.structural(label, fn);
  }

  // ---------- inserir / excluir linhas e colunas ----------

  private rewriteAllFormulas(fn: (f: string, sheetName: string) => string): void {
    for (const s of this.sheets) {
      for (const [k, c] of s.cells) {
        if (c.f == null) continue;
        const nf = fn(c.f, s.name);
        if (nf !== c.f) s.cells.set(k, { ...c, f: nf });
      }
    }
  }

  private shiftMap<T>(m: Map<number, T>, at: number, count: number): Map<number, T> {
    const out = new Map<number, T>();
    for (const [i, v] of m) {
      if (count < 0 && i >= at && i < at - count) continue;
      out.set(i >= at ? i + count : i, v);
    }
    return out;
  }

  insertRows(sheet: Sheet, at: number, count = 1): void {
    this.structuralRows(sheet, at, count, count > 1 ? `Inserir ${count} linhas` : 'Inserir linha');
  }
  deleteRows(sheet: Sheet, at: number, count = 1): void {
    this.structuralRows(sheet, at, -count, count > 1 ? `Excluir ${count} linhas` : 'Excluir linha');
  }
  insertCols(sheet: Sheet, at: number, count = 1): void {
    this.structuralCols(sheet, at, count, count > 1 ? `Inserir ${count} colunas` : 'Inserir coluna');
  }
  deleteCols(sheet: Sheet, at: number, count = 1): void {
    this.structuralCols(sheet, at, -count, count > 1 ? `Excluir ${count} colunas` : 'Excluir coluna');
  }

  private structuralRows(sheet: Sheet, at: number, count: number, label: string): void {
    this.structural(label, () => {
      const op: StructOp = { sheet: sheet.name, axis: 'row', at, count };
      this.rewriteAllFormulas((f, sn) => adjustFormula(f, sn, op));
      const cells = new Map<number, Cell>();
      for (const [k, c] of sheet.cells) {
        const r = keyRow(k);
        const col = keyCol(k);
        if (count < 0 && r >= at && r < at - count) continue;
        const nr = r >= at ? r + count : r;
        if (nr >= MAX_ROWS) continue;
        cells.set(cellKey(nr, col), c);
      }
      sheet.cells = cells;
      sheet.rowHeights = this.shiftMap(sheet.rowHeights, at, count);
      const hidden = new Set<number>();
      for (const r of sheet.hiddenRows) {
        if (count < 0 && r >= at && r < at - count) continue;
        hidden.add(r >= at ? r + count : r);
      }
      sheet.hiddenRows = hidden;
      if (sheet.filter) {
        if (count < 0 && sheet.filter.headerRow >= at && sheet.filter.headerRow < at - count) sheet.filter = null;
        else if (sheet.filter.headerRow >= at) sheet.filter.headerRow += count;
      }
      if (sheet.freezeRows > at) sheet.freezeRows = Math.max(0, sheet.freezeRows + count);
      sheet.touch();
    });
  }

  private structuralCols(sheet: Sheet, at: number, count: number, label: string): void {
    this.structural(label, () => {
      const op: StructOp = { sheet: sheet.name, axis: 'col', at, count };
      this.rewriteAllFormulas((f, sn) => adjustFormula(f, sn, op));
      const cells = new Map<number, Cell>();
      for (const [k, c] of sheet.cells) {
        const r = keyRow(k);
        const col = keyCol(k);
        if (count < 0 && col >= at && col < at - count) continue;
        const nc = col >= at ? col + count : col;
        if (nc >= MAX_COLS) continue;
        cells.set(cellKey(r, nc), c);
      }
      sheet.cells = cells;
      sheet.colWidths = this.shiftMap(sheet.colWidths, at, count);
      if (sheet.filter) {
        const f = sheet.filter;
        const allowed: Record<number, string[]> = {};
        for (const [k, v] of Object.entries(f.allowed)) {
          const c = +k;
          if (count < 0 && c >= at && c < at - count) continue;
          allowed[c >= at ? c + count : c] = v;
        }
        f.allowed = allowed;
        if (f.c1 >= at) f.c1 = Math.max(at, f.c1 + count);
        if (f.c2 >= at) f.c2 = Math.max(f.c1, f.c2 + count);
      }
      sheet.touch();
    });
  }

  // ---------- abas ----------

  uniqueSheetName(base: string): string {
    if (!this.sheetByName(base)) return base;
    for (let i = 2; ; i++) {
      const n = `${base} (${i})`;
      if (!this.sheetByName(n)) return n;
    }
  }

  nextSheetName(): string {
    for (let i = this.sheets.length + 1; ; i++) {
      const n = `Planilha${i}`;
      if (!this.sheetByName(n)) return n;
    }
  }

  static validateSheetName(name: string): string | null {
    const n = name.trim();
    if (!n) return 'O nome da aba não pode ficar vazio.';
    if (n.length > 31) return 'O nome da aba pode ter no máximo 31 caracteres.';
    if (/[\\/?*[\]:]/.test(n)) return 'O nome da aba não pode ter os caracteres  \\ / ? * [ ] :';
    if (n.startsWith("'") || n.endsWith("'")) return 'O nome da aba não pode começar ou terminar com apóstrofo.';
    return null;
  }

  addSheet(name?: string, index?: number): Sheet {
    const s = new Sheet(name ?? this.nextSheetName());
    this.structural('Nova aba', () => {
      this.sheets.splice(index ?? this.sheets.length, 0, s);
    });
    return s;
  }

  renameSheet(sheet: Sheet, name: string): void {
    const err = Workbook.validateSheetName(name);
    if (err) throw new InputError(err);
    const other = this.sheetByName(name.trim());
    if (other && other !== sheet) throw new InputError('Já existe uma aba com esse nome.');
    const old = sheet.name;
    this.structural('Renomear aba', () => {
      sheet.name = name.trim();
      this.rewriteAllFormulas((f) => renameSheetInFormula(f, old, sheet.name));
    });
  }

  removeSheet(sheet: Sheet): void {
    if (this.sheets.length <= 1) throw new InputError('A pasta precisa ter pelo menos uma aba.');
    this.structural('Excluir aba', () => {
      this.sheets = this.sheets.filter((s) => s !== sheet);
      this.rewriteAllFormulas((f) => removeSheetInFormula(f, sheet.name));
    });
  }

  duplicateSheet(sheet: Sheet): Sheet {
    const copy = sheetFromJSON(structuredClone(sheetToJSON(sheet)));
    copy.name = this.uniqueSheetName(sheet.name + ' cópia');
    if (copy.name.length > 31) copy.name = this.uniqueSheetName(sheet.name.slice(0, 24) + ' cópia');
    this.structural('Duplicar aba', () => {
      this.sheets.splice(this.sheets.indexOf(sheet) + 1, 0, copy);
    });
    return copy;
  }

  moveSheet(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.sheets.length || to >= this.sheets.length) return;
    this.structural('Mover aba', () => {
      const [s] = this.sheets.splice(from, 1);
      this.sheets.splice(to, 0, s);
    });
  }

  // ---------- serialização ----------

  toJSON(activeSheet = 0): WorkbookJSON {
    return { format: 'excel-facil', version: 1, activeSheet, sheets: this.sheets.map(sheetToJSON) };
  }

  static fromJSON(j: WorkbookJSON): Workbook {
    if (!j || j.format !== 'excel-facil' || !Array.isArray(j.sheets) || !j.sheets.length) {
      throw new Error('Dados de planilha inválidos.');
    }
    const wb = new Workbook([]);
    wb.sheets = j.sheets.map(sheetFromJSON);
    wb.engine.rebuild();
    return wb;
  }

  /** Recalcula tudo (inclui HOJE/AGORA). */
  recalcAll(): void {
    this.engine.invalidateAll();
    this.changed();
  }

  notify(): void {
    this.changed();
  }
}
