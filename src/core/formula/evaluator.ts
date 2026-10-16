// Avaliação de fórmulas. Nenhum código da planilha é executado como JavaScript:
// a fórmula vira uma árvore e só operações conhecidas são aplicadas.

import { Range } from '../address';
import { dateToSerial, formatNumberBR, parseNumberBR, serialToDate, todaySerial } from '../format';
import { ErrorValue, isError, Sheet, Value } from '../model';
import { Node, RefNode } from './parser';

export interface EvalContext {
  sheet: Sheet;
  resolveSheet(name: string | null): Sheet | null;
  value(sheet: Sheet, row: number, col: number): Value;
}

interface RangeArg {
  kind: 'range';
  sheet: Sheet;
  range: Range;
}

type Arg = Value | RangeArg;

const E = (code: string): ErrorValue => ({ err: code });
export const ERR = {
  DIV0: E('#DIV/0!'),
  VALUE: E('#VALUE!'),
  REF: E('#REF!'),
  NAME: E('#NAME?'),
  NA: E('#N/A'),
  NUM: E('#NUM!'),
  CIRC: E('#CIRC!'),
};

class FormulaError extends Error {
  constructor(public value: ErrorValue) {
    super(value.err);
  }
}

function isRange(a: Arg): a is RangeArg {
  return typeof a === 'object' && a !== null && (a as RangeArg).kind === 'range';
}

function clampRange(sheet: Sheet, r: Range): Range {
  const u = sheet.used();
  return { r1: r.r1, c1: r.c1, r2: Math.min(r.r2, Math.max(u.rows - 1, r.r1)), c2: Math.min(r.c2, Math.max(u.cols - 1, r.c1)) };
}

// ---------- conversões ----------

export function toNumber(v: Value): number {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isError(v)) throw new FormulaError(v);
  const n = parseNumberBR(v);
  if (n === null) throw new FormulaError(ERR.VALUE);
  return n;
}

export function toText(v: Value): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (typeof v === 'number') return formatNumberBR(v, undefined, false);
  throw new FormulaError(v);
}

function toBool(v: Value): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === undefined) return false;
  if (isError(v)) throw new FormulaError(v);
  const up = v.toUpperCase();
  if (up === 'VERDADEIRO' || up === 'TRUE') return true;
  if (up === 'FALSO' || up === 'FALSE' || up === '') return false;
  throw new FormulaError(ERR.VALUE);
}

function typeRank(v: Value): number {
  if (typeof v === 'number') return 0;
  if (typeof v === 'string') return 1;
  if (typeof v === 'boolean') return 2;
  return 0;
}

export function compareValues(a: Value, b: Value): number {
  if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  }
  const x = Number(a);
  const y = Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------- critérios (SOMASE / CONT.SE) ----------

function makeCriteria(crit: Value): (v: Value) => boolean {
  if (typeof crit === 'number' || typeof crit === 'boolean') {
    return (v) => v !== null && !isError(v) && compareValues(v, crit) === 0 && typeof v === typeof crit;
  }
  if (crit === null) return (v) => v === null || v === '';
  if (isError(crit)) throw new FormulaError(crit);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(crit)!;
  const op = m[1] ?? '=';
  const rest = m[2];
  const num = parseNumberBR(rest);
  if (num !== null) {
    return (v) => {
      if (typeof v !== 'number') return op === '<>' ? true : false;
      switch (op) {
        case '=':
          return v === num;
        case '<>':
          return v !== num;
        case '<':
          return v < num;
        case '>':
          return v > num;
        case '<=':
          return v <= num;
        default:
          return v >= num;
      }
    };
  }
  if (rest === '') {
    if (op === '<>') return (v) => v !== null && v !== '';
    return (v) => v === null || v === '';
  }
  const pattern = new RegExp(
    '^' +
      rest
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
    'is',
  );
  return (v) => {
    if (isError(v)) return false;
    const s = v === null ? '' : typeof v === 'string' ? v : null;
    if (op === '=' || op === '<>') {
      const match = s !== null && pattern.test(s);
      return op === '=' ? match : !match;
    }
    if (s === null) return false;
    const c = s.localeCompare(rest, 'pt-BR', { sensitivity: 'base' });
    if (op === '<') return c < 0;
    if (op === '>') return c > 0;
    if (op === '<=') return c <= 0;
    return c >= 0;
  };
}

// ---------- avaliador ----------

export class Evaluator {
  constructor(private ctx: EvalContext) {}

  run(node: Node): Value {
    try {
      const v = this.scalar(node);
      if (typeof v === 'number' && !isFinite(v)) return ERR.NUM;
      return v;
    } catch (e) {
      if (e instanceof FormulaError) return e.value;
      throw e;
    }
  }

  private sheetOf(n: RefNode): Sheet {
    const s = this.ctx.resolveSheet(n.sheet);
    if (!s) throw new FormulaError(ERR.REF);
    return s;
  }

  private arg(node: Node): Arg {
    if (node.t === 'ref' && node.isRange) {
      return { kind: 'range', sheet: this.sheetOf(node), range: { r1: node.r1, c1: node.c1, r2: node.r2, c2: node.c2 } };
    }
    return this.scalarNoThrowRange(node);
  }

  private scalarNoThrowRange(node: Node): Value {
    try {
      return this.scalar(node);
    } catch (e) {
      if (e instanceof FormulaError) return e.value;
      throw e;
    }
  }

  /** Avalia um nó até um valor simples. Erros viram exceção. */
  scalar(node: Node): Value {
    switch (node.t) {
      case 'num':
        return node.v;
      case 'str':
        return node.v;
      case 'bool':
        return node.v;
      case 'err':
        throw new FormulaError({ err: node.v });
      case 'name':
        if (node.v === '') return null;
        throw new FormulaError(ERR.NAME);
      case 'ref': {
        const s = this.sheetOf(node);
        if (node.isRange) {
          // Intervalo usado como valor único: só vale se tiver uma célula.
          if (node.r1 === node.r2 && node.c1 === node.c2) return this.cell(s, node.r1, node.c1);
          throw new FormulaError(ERR.VALUE);
        }
        return this.cell(s, node.r1, node.c1);
      }
      case 'neg':
        return -toNumber(this.scalar(node.a));
      case 'pct':
        return toNumber(this.scalar(node.a)) / 100;
      case 'bin':
        return this.binary(node.op, node.a, node.b);
      case 'func':
        return this.call(node.name, node.args);
    }
  }

  private cell(s: Sheet, r: number, c: number): Value {
    const v = this.ctx.value(s, r, c);
    if (isError(v)) throw new FormulaError(v);
    return v;
  }

  private binary(op: string, an: Node, bn: Node): Value {
    const a = this.scalar(an);
    const b = this.scalar(bn);
    switch (op) {
      case '+':
        return toNumber(a) + toNumber(b);
      case '-':
        return toNumber(a) - toNumber(b);
      case '*':
        return toNumber(a) * toNumber(b);
      case '/': {
        const d = toNumber(b);
        if (d === 0) throw new FormulaError(ERR.DIV0);
        return toNumber(a) / d;
      }
      case '^': {
        const r = Math.pow(toNumber(a), toNumber(b));
        if (!isFinite(r) || isNaN(r)) throw new FormulaError(ERR.NUM);
        return r;
      }
      case '&':
        return toText(a) + toText(b);
      case '=':
        return compareValues(a, b) === 0;
      case '<>':
        return compareValues(a, b) !== 0;
      case '<':
        return compareValues(a, b) < 0;
      case '>':
        return compareValues(a, b) > 0;
      case '<=':
        return compareValues(a, b) <= 0;
      case '>=':
        return compareValues(a, b) >= 0;
    }
    throw new FormulaError(ERR.VALUE);
  }

  /** Percorre os números de uma lista de argumentos (regras do SOMA/MÉDIA). */
  private numbers(args: Node[], cb: (n: number) => void, opts: { countBoolsInRange?: boolean } = {}): void {
    for (const node of args) {
      const a = this.arg(node);
      if (isRange(a)) {
        a.sheet.forEachIn(clampRange(a.sheet, a.range), (r, c) => {
          const v = this.ctx.value(a.sheet, r, c);
          if (isError(v)) throw new FormulaError(v);
          if (typeof v === 'number') cb(v);
          else if (opts.countBoolsInRange && typeof v === 'boolean') cb(v ? 1 : 0);
        });
      } else {
        if (isError(a)) throw new FormulaError(a);
        if (a === null) continue;
        cb(toNumber(a));
      }
    }
  }

  private values(node: Node, cb: (v: Value, r: number, c: number) => void, includeBlanks = false): void {
    const a = this.arg(node);
    if (isRange(a)) {
      const rg = clampRange(a.sheet, a.range);
      if (includeBlanks) {
        for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) cb(this.ctx.value(a.sheet, r, c), r - rg.r1, c - rg.c1);
      } else {
        a.sheet.forEachIn(rg, (r, c) => cb(this.ctx.value(a.sheet, r, c), r - rg.r1, c - rg.c1));
      }
    } else {
      cb(a, 0, 0);
    }
  }

  private need(args: Node[], min: number, max: number): void {
    if (args.length < min || args.length > max) throw new FormulaError(ERR.VALUE);
  }

  private call(name: string, args: Node[]): Value {
    switch (name) {
      case 'SUM': {
        let s = 0;
        this.numbers(args, (n) => (s += n));
        return s;
      }
      case 'PRODUCT': {
        let p = 1;
        let any = false;
        this.numbers(args, (n) => {
          p *= n;
          any = true;
        });
        return any ? p : 0;
      }
      case 'AVERAGE': {
        let s = 0;
        let k = 0;
        this.numbers(args, (n) => {
          s += n;
          k++;
        });
        if (k === 0) throw new FormulaError(ERR.DIV0);
        return s / k;
      }
      case 'MIN':
      case 'MAX': {
        let best: number | null = null;
        this.numbers(args, (n) => {
          if (best === null || (name === 'MIN' ? n < best : n > best)) best = n;
        });
        return best ?? 0;
      }
      case 'MEDIAN': {
        const xs: number[] = [];
        this.numbers(args, (n) => xs.push(n));
        if (!xs.length) throw new FormulaError(ERR.NUM);
        xs.sort((a, b) => a - b);
        const m = xs.length >> 1;
        return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
      }
      case 'COUNT': {
        let k = 0;
        for (const node of args) {
          this.values(node, (v) => {
            if (typeof v === 'number') k++;
            else if (node.t !== 'ref' && typeof v === 'string' && parseNumberBR(v) !== null) k++;
          });
        }
        return k;
      }
      case 'COUNTA': {
        let k = 0;
        for (const node of args) this.values(node, (v) => {
          if (v !== null && v !== undefined) k++;
        });
        return k;
      }
      case 'COUNTBLANK': {
        this.need(args, 1, 1);
        let k = 0;
        this.values(args[0], (v) => {
          if (v === null || v === '') k++;
        }, true);
        return k;
      }
      case 'IF': {
        this.need(args, 1, 3);
        const cond = toBool(this.scalar(args[0]));
        if (cond) return args.length >= 2 ? this.scalar(args[1]) ?? 0 : true;
        return args.length >= 3 ? this.scalar(args[2]) ?? 0 : false;
      }
      case 'IFERROR': {
        this.need(args, 2, 2);
        try {
          return this.scalar(args[0]);
        } catch (e) {
          if (e instanceof FormulaError) return this.scalar(args[1]);
          throw e;
        }
      }
      case 'AND':
      case 'OR': {
        if (!args.length) throw new FormulaError(ERR.VALUE);
        let acc = name === 'AND';
        for (const node of args) {
          this.values(node, (v) => {
            if (isError(v)) throw new FormulaError(v);
            if (v === null || typeof v === 'string') return;
            const b = toBool(v);
            acc = name === 'AND' ? acc && b : acc || b;
          });
        }
        return acc;
      }
      case 'NOT':
        this.need(args, 1, 1);
        return !toBool(this.scalar(args[0]));
      case 'ROUND':
      case 'ROUNDUP':
      case 'ROUNDDOWN': {
        this.need(args, 1, 2);
        const x = toNumber(this.scalar(args[0]));
        const d = args[1] ? Math.trunc(toNumber(this.scalar(args[1]))) : 0;
        const f = Math.pow(10, d);
        const y = Math.abs(x) * f;
        // Pequena correção para erros binários (ex.: 1,005 -> 1,01).
        const yy = parseFloat(y.toPrecision(15));
        const r = name === 'ROUND' ? Math.round(yy) : name === 'ROUNDUP' ? Math.ceil(yy) : Math.floor(yy);
        return (Math.sign(x) * r) / f;
      }
      case 'INT':
        this.need(args, 1, 1);
        return Math.floor(toNumber(this.scalar(args[0])));
      case 'ABS':
        this.need(args, 1, 1);
        return Math.abs(toNumber(this.scalar(args[0])));
      case 'SQRT': {
        this.need(args, 1, 1);
        const x = toNumber(this.scalar(args[0]));
        if (x < 0) throw new FormulaError(ERR.NUM);
        return Math.sqrt(x);
      }
      case 'POWER': {
        this.need(args, 2, 2);
        const r = Math.pow(toNumber(this.scalar(args[0])), toNumber(this.scalar(args[1])));
        if (!isFinite(r) || isNaN(r)) throw new FormulaError(ERR.NUM);
        return r;
      }
      case 'MOD': {
        this.need(args, 2, 2);
        const a = toNumber(this.scalar(args[0]));
        const b = toNumber(this.scalar(args[1]));
        if (b === 0) throw new FormulaError(ERR.DIV0);
        return a - b * Math.floor(a / b);
      }
      case 'SUMIF':
      case 'AVERAGEIF': {
        this.need(args, 2, 3);
        const test = makeCriteria(this.scalar(args[1]));
        const rangeArg = this.arg(args[0]);
        const sumArg = args[2] ? this.arg(args[2]) : rangeArg;
        if (!isRange(rangeArg) || !isRange(sumArg)) throw new FormulaError(ERR.VALUE);
        const rg = clampRange(rangeArg.sheet, rangeArg.range);
        let s = 0;
        let k = 0;
        for (let r = rg.r1; r <= rg.r2; r++) {
          for (let c = rg.c1; c <= rg.c2; c++) {
            if (!test(this.ctx.value(rangeArg.sheet, r, c))) continue;
            const v = this.ctx.value(sumArg.sheet, sumArg.range.r1 + (r - rg.r1), sumArg.range.c1 + (c - rg.c1));
            if (isError(v)) throw new FormulaError(v);
            if (typeof v === 'number') {
              s += v;
              k++;
            }
          }
        }
        if (name === 'AVERAGEIF') {
          if (k === 0) throw new FormulaError(ERR.DIV0);
          return s / k;
        }
        return s;
      }
      case 'COUNTIF': {
        this.need(args, 2, 2);
        const test = makeCriteria(this.scalar(args[1]));
        let k = 0;
        this.values(args[0], (v) => {
          if (test(v)) k++;
        }, true);
        return k;
      }
      case 'VLOOKUP': {
        this.need(args, 3, 4);
        const look = this.scalar(args[0]);
        const tbl = this.arg(args[1]);
        if (!isRange(tbl)) throw new FormulaError(ERR.VALUE);
        const col = Math.trunc(toNumber(this.scalar(args[2])));
        const approx = args[3] ? toBool(this.scalar(args[3])) : true;
        const rg = clampRange(tbl.sheet, tbl.range);
        if (col < 1 || col > tbl.range.c2 - tbl.range.c1 + 1) throw new FormulaError(ERR.REF);
        let found = -1;
        for (let r = rg.r1; r <= rg.r2; r++) {
          const v = this.ctx.value(tbl.sheet, r, rg.c1);
          if (v === null || isError(v)) continue;
          const cmp = compareValues(v, look);
          if (cmp === 0 && typeRank(v) === typeRank(look)) {
            found = r;
            if (!approx) break;
          } else if (approx && typeRank(v) === typeRank(look)) {
            if (cmp < 0) found = r;
            else break;
          }
        }
        if (found < 0) throw new FormulaError(ERR.NA);
        return this.cell(tbl.sheet, found, tbl.range.c1 + col - 1);
      }
      case 'CONCATENATE':
      case 'CONCAT': {
        let s = '';
        for (const node of args) this.values(node, (v) => {
          if (isError(v)) throw new FormulaError(v);
          s += toText(v);
        });
        return s;
      }
      case 'LEFT':
      case 'RIGHT': {
        this.need(args, 1, 2);
        const s = toText(this.scalar(args[0]));
        const k = args[1] ? toNumber(this.scalar(args[1])) : 1;
        if (k < 0) throw new FormulaError(ERR.VALUE);
        return name === 'LEFT' ? s.slice(0, k) : k === 0 ? '' : s.slice(-k);
      }
      case 'MID': {
        this.need(args, 3, 3);
        const s = toText(this.scalar(args[0]));
        const st = Math.trunc(toNumber(this.scalar(args[1])));
        const k = Math.trunc(toNumber(this.scalar(args[2])));
        if (st < 1 || k < 0) throw new FormulaError(ERR.VALUE);
        return s.substr(st - 1, k);
      }
      case 'LEN':
        this.need(args, 1, 1);
        return toText(this.scalar(args[0])).length;
      case 'UPPER':
        this.need(args, 1, 1);
        return toText(this.scalar(args[0])).toLocaleUpperCase('pt-BR');
      case 'LOWER':
        this.need(args, 1, 1);
        return toText(this.scalar(args[0])).toLocaleLowerCase('pt-BR');
      case 'TRIM':
        this.need(args, 1, 1);
        return toText(this.scalar(args[0])).trim().replace(/ {2,}/g, ' ');
      case 'TODAY':
        this.need(args, 0, 0);
        return todaySerial();
      case 'NOW': {
        this.need(args, 0, 0);
        const d = new Date();
        return todaySerial() + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
      }
      case 'DATE': {
        this.need(args, 3, 3);
        const y = Math.trunc(toNumber(this.scalar(args[0])));
        const m = Math.trunc(toNumber(this.scalar(args[1])));
        const d = Math.trunc(toNumber(this.scalar(args[2])));
        // dateToSerial aceita mês/dia fora do intervalo (ex.: mês 13 = janeiro do ano seguinte).
        return dateToSerial(y < 100 ? y + 1900 : y, m, d);
      }
      case 'YEAR':
      case 'MONTH':
      case 'DAY': {
        this.need(args, 1, 1);
        const x = toNumber(this.scalar(args[0]));
        if (x < 0) throw new FormulaError(ERR.NUM);
        const p = serialToDate(x);
        return name === 'YEAR' ? p.y : name === 'MONTH' ? p.m : p.d;
      }
      default:
        throw new FormulaError(ERR.NAME);
    }
  }
}
