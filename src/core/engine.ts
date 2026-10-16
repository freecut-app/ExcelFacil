// Motor de recálculo incremental.
// - Cada fórmula é analisada uma vez e suas referências são indexadas.
// - Quando uma célula muda, só as fórmulas que dependem dela (direta ou
//   indiretamente) são marcadas como "sujas".
// - O cálculo é preguiçoso (só quando o valor é pedido) e usa pilha explícita,
//   então cadeias longas (A2=A1+1, A3=A2+1, ...) não estouram a pilha.

import { cellKey, keyCol, keyRow, Range } from './address';
import { ERR, Evaluator } from './formula/evaluator';
import { SUPPORTED_FUNCS } from './formula/locale';
import { collectRefs, Node, parseFormula, usesFunctions } from './formula/parser';
import { Sheet, Value } from './model';

const SHEET_MUL = 2 ** 34;
const gkOf = (uid: number, key: number) => uid * SHEET_MUL + key;
const uidOf = (gk: number) => Math.floor(gk / SHEET_MUL);
const keyOf = (gk: number) => gk % SHEET_MUL;

interface RangeDep {
  uid: number;
  range: Range;
  fk: number;
}

interface FormulaInfo {
  ast: Node | null;
  unsupported: boolean;
  deps: { uid: number; range: Range; single: boolean }[];
  rangeEntries: RangeDep[];
}

const WIDE = 64;

export interface SheetResolver {
  sheets(): Sheet[];
  byName(name: string): Sheet | null;
  byUid(uid: number): Sheet | null;
}

export class Engine {
  private info = new Map<number, FormulaInfo>();
  private values = new Map<number, Value>();
  private dirty = new Set<number>();
  private single = new Map<number, Set<number>>();
  private buckets = new Map<number, { cols: Map<number, Set<RangeDep>>; wide: Set<RangeDep> }>();
  private formulaKeys = new Map<number, Set<number>>();
  private state: Map<number, number> | null = null;

  constructor(private res: SheetResolver) {}

  // ---------- registro ----------

  rebuild(): void {
    this.info.clear();
    this.values.clear();
    this.dirty.clear();
    this.single.clear();
    this.buckets.clear();
    this.formulaKeys.clear();
    for (const s of this.res.sheets()) {
      for (const [k, c] of s.cells) if (c.f != null) this.register(s, k, c.f);
    }
  }

  private bucket(uid: number) {
    let b = this.buckets.get(uid);
    if (!b) {
      b = { cols: new Map(), wide: new Set() };
      this.buckets.set(uid, b);
    }
    return b;
  }

  private register(sheet: Sheet, key: number, formula: string): void {
    const fk = gkOf(sheet.uid, key);
    let ast: Node | null = null;
    try {
      ast = parseFormula(formula);
    } catch {
      ast = null;
    }
    const fi: FormulaInfo = { ast, unsupported: false, deps: [], rangeEntries: [] };
    if (ast) {
      for (const f of usesFunctions(ast)) if (!SUPPORTED_FUNCS.has(f)) fi.unsupported = true;
      for (const r of collectRefs(ast)) {
        const target = r.sheet == null ? sheet : this.res.byName(r.sheet);
        if (!target) continue;
        const range = { r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c2 };
        const isSingle = r.r1 === r.r2 && r.c1 === r.c2;
        fi.deps.push({ uid: target.uid, range, single: isSingle });
        if (isSingle) {
          const tk = gkOf(target.uid, cellKey(r.r1, r.c1));
          let set = this.single.get(tk);
          if (!set) this.single.set(tk, (set = new Set()));
          set.add(fk);
        } else {
          const entry: RangeDep = { uid: target.uid, range, fk };
          fi.rangeEntries.push(entry);
          const b = this.bucket(target.uid);
          if (r.c2 - r.c1 + 1 > WIDE) b.wide.add(entry);
          else
            for (let c = r.c1; c <= r.c2; c++) {
              let set = b.cols.get(c);
              if (!set) b.cols.set(c, (set = new Set()));
              set.add(entry);
            }
        }
      }
    }
    this.info.set(fk, fi);
    let fks = this.formulaKeys.get(sheet.uid);
    if (!fks) this.formulaKeys.set(sheet.uid, (fks = new Set()));
    fks.add(key);
    this.dirty.add(fk);
  }

  private unregister(uid: number, key: number): void {
    const fk = gkOf(uid, key);
    const fi = this.info.get(fk);
    if (!fi) return;
    for (const d of fi.deps) {
      if (d.single) {
        const tk = gkOf(d.uid, cellKey(d.range.r1, d.range.c1));
        const set = this.single.get(tk);
        if (set) {
          set.delete(fk);
          if (!set.size) this.single.delete(tk);
        }
      }
    }
    for (const e of fi.rangeEntries) {
      const b = this.buckets.get(e.uid);
      if (!b) continue;
      b.wide.delete(e);
      for (let c = e.range.c1; c <= e.range.c2 && e.range.c2 - e.range.c1 + 1 <= WIDE; c++) b.cols.get(c)?.delete(e);
    }
    this.info.delete(fk);
    this.values.delete(fk);
    this.dirty.delete(fk);
    this.formulaKeys.get(uid)?.delete(key);
  }

  /** Chamado depois que uma célula foi alterada (já gravada na aba). */
  cellChanged(sheet: Sheet, row: number, col: number): void {
    this.cellsChanged(sheet, [cellKey(row, col)]);
  }

  cellsChanged(sheet: Sheet, keys: Iterable<number>): void {
    const seeds: number[] = [];
    for (const key of keys) {
      this.unregister(sheet.uid, key);
      const c = sheet.cells.get(key);
      if (c?.f != null) this.register(sheet, key, c.f);
      seeds.push(gkOf(sheet.uid, key));
    }
    this.invalidateFrom(seeds);
  }

  private dependentsOf(gk: number, out: (fk: number) => void): void {
    const set = this.single.get(gk);
    if (set) for (const fk of set) out(fk);
    const b = this.buckets.get(uidOf(gk));
    if (!b) return;
    const key = keyOf(gk);
    const r = keyRow(key);
    const c = keyCol(key);
    const col = b.cols.get(c);
    if (col) for (const e of col) if (r >= e.range.r1 && r <= e.range.r2) out(e.fk);
    for (const e of b.wide) if (r >= e.range.r1 && r <= e.range.r2 && c >= e.range.c1 && c <= e.range.c2) out(e.fk);
  }

  private invalidateFrom(seeds: number[]): void {
    const queue = [...seeds];
    const seen = new Set<number>(seeds);
    while (queue.length) {
      const gk = queue.pop()!;
      this.dependentsOf(gk, (fk) => {
        if (seen.has(fk)) return;
        seen.add(fk);
        this.dirty.add(fk);
        queue.push(fk);
      });
    }
  }

  invalidateAll(): void {
    for (const fk of this.info.keys()) this.dirty.add(fk);
  }

  // ---------- cálculo ----------

  private precedents(fk: number, out: (gk: number) => void): void {
    const fi = this.info.get(fk);
    if (!fi) return;
    for (const d of fi.deps) {
      if (d.single) {
        const gk = gkOf(d.uid, cellKey(d.range.r1, d.range.c1));
        if (this.dirty.has(gk)) out(gk);
        continue;
      }
      const fks = this.formulaKeys.get(d.uid);
      if (!fks || !fks.size) continue;
      const area = (d.range.r2 - d.range.r1 + 1) * (d.range.c2 - d.range.c1 + 1);
      if (area < fks.size) {
        for (let r = d.range.r1; r <= d.range.r2; r++)
          for (let c = d.range.c1; c <= d.range.c2; c++) {
            const gk = gkOf(d.uid, cellKey(r, c));
            if (this.dirty.has(gk)) out(gk);
          }
      } else {
        for (const k of fks) {
          const r = keyRow(k);
          const c = keyCol(k);
          if (r < d.range.r1 || r > d.range.r2 || c < d.range.c1 || c > d.range.c2) continue;
          const gk = gkOf(d.uid, k);
          if (this.dirty.has(gk)) out(gk);
        }
      }
    }
  }

  private ensure(start: number): void {
    const outer = this.state === null;
    if (outer) this.state = new Map();
    const state = this.state!;
    const stack = [start];
    while (stack.length) {
      const fk = stack[stack.length - 1];
      if (!this.dirty.has(fk)) {
        stack.pop();
        continue;
      }
      const st = state.get(fk);
      if (st === undefined) {
        state.set(fk, 1);
        this.precedents(fk, (p) => {
          if (!state.has(p)) stack.push(p);
        });
        continue;
      }
      stack.pop();
      if (st === 1) {
        this.compute(fk);
        state.set(fk, 2);
      }
    }
    if (outer) this.state = null;
  }

  private compute(fk: number): void {
    const sheet = this.res.byUid(uidOf(fk));
    const key = keyOf(fk);
    const fi = this.info.get(fk);
    const cell = sheet?.cells.get(key);
    let v: Value;
    if (!sheet || !fi || !cell) v = null;
    else if (!fi.ast || fi.unsupported) {
      // Fórmula com recurso não suportado: mantém o último resultado salvo no arquivo.
      v = cell.v !== undefined && cell.v !== null ? cell.v : fi.ast ? ERR.NAME : { err: '#SYNTAX!' };
    } else {
      const ev = new Evaluator({
        sheet,
        resolveSheet: (name) => (name == null ? sheet : this.res.byName(name)),
        value: (s, r, c) => this.cellValue(s, r, c),
      });
      v = ev.run(fi.ast);
    }
    this.values.set(fk, v);
    this.dirty.delete(fk);
  }

  /** Valor (calculado) de uma célula. */
  cellValue(sheet: Sheet, row: number, col: number): Value {
    const key = cellKey(row, col);
    const cell = sheet.cells.get(key);
    if (!cell) return null;
    if (cell.f == null) return cell.v ?? null;
    const fk = gkOf(sheet.uid, key);
    if (this.dirty.has(fk)) {
      if (this.state && this.state.get(fk) === 1) return ERR.CIRC;
      this.ensure(fk);
    }
    return this.values.get(fk) ?? null;
  }

  isUnsupported(sheet: Sheet, row: number, col: number): boolean {
    return !!this.info.get(gkOf(sheet.uid, cellKey(row, col)))?.unsupported;
  }

  formulaCount(): number {
    return this.info.size;
  }
}

