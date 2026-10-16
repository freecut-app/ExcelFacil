// Parser de fórmulas canônicas -> árvore sintática (AST).
// Precedência (igual ao Excel, da mais forte para a mais fraca):
//   negação unária, %, ^, * /, + -, &, comparações.

import { lettersToCol, MAX_ROWS } from '../address';
import { FormulaSyntaxError, tokenize, Token } from './tokenizer';

export interface RefNode {
  t: 'ref';
  sheet: string | null;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  isRange: boolean;
}

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: string }
  | RefNode
  | { t: 'func'; name: string; args: Node[] }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'neg'; a: Node }
  | { t: 'pct'; a: Node }
  | { t: 'name'; v: string };

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;
const COL_RE = /^\$?([A-Za-z]{1,3})$/;

export function parseRefText(ref: string): Omit<RefNode, 't' | 'sheet'> | null {
  const parts = ref.split(':');
  const cell = (p: string) => {
    const m = CELL_RE.exec(p);
    if (!m) return null;
    return { r: parseInt(m[2], 10) - 1, c: lettersToCol(m[1]) };
  };
  if (parts.length === 1) {
    const a = cell(parts[0]);
    if (!a || a.r < 0) return null;
    return { r1: a.r, c1: a.c, r2: a.r, c2: a.c, isRange: false };
  }
  const a = cell(parts[0]);
  const b = cell(parts[1]);
  if (a && b) {
    if (a.r < 0 || b.r < 0) return null;
    return {
      r1: Math.min(a.r, b.r),
      c1: Math.min(a.c, b.c),
      r2: Math.max(a.r, b.r),
      c2: Math.max(a.c, b.c),
      isRange: true,
    };
  }
  const ca = COL_RE.exec(parts[0]);
  const cb = COL_RE.exec(parts[1]);
  if (ca && cb) {
    const x = lettersToCol(ca[1]);
    const y = lettersToCol(cb[1]);
    return { r1: 0, c1: Math.min(x, y), r2: MAX_ROWS - 1, c2: Math.max(x, y), isRange: true };
  }
  return null;
}

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  private peek(): Token | undefined {
    return this.toks[this.pos];
  }
  private next(): Token {
    const t = this.toks[this.pos++];
    if (!t) throw new FormulaSyntaxError('A fórmula terminou antes do esperado');
    return t;
  }
  private isOp(...ops: string[]): boolean {
    const t = this.peek();
    return !!t && t.type === 'op' && ops.includes(t.text);
  }

  parse(): Node {
    if (this.toks.length === 0) throw new FormulaSyntaxError('Fórmula vazia');
    const n = this.comparison();
    if (this.pos < this.toks.length) {
      const t = this.peek()!;
      if (t.type === 'rp') throw new FormulaSyntaxError('Há um ")" sobrando');
      throw new FormulaSyntaxError(`Não entendi "${t.text}" nesta posição`);
    }
    return n;
  }

  private comparison(): Node {
    let a = this.concat();
    while (this.isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = this.next().text;
      a = { t: 'bin', op, a, b: this.concat() };
    }
    return a;
  }
  private concat(): Node {
    let a = this.additive();
    while (this.isOp('&')) {
      this.next();
      a = { t: 'bin', op: '&', a, b: this.additive() };
    }
    return a;
  }
  private additive(): Node {
    let a = this.multiplicative();
    while (this.isOp('+', '-')) {
      const op = this.next().text;
      a = { t: 'bin', op, a, b: this.multiplicative() };
    }
    return a;
  }
  private multiplicative(): Node {
    let a = this.power();
    while (this.isOp('*', '/')) {
      const op = this.next().text;
      a = { t: 'bin', op, a, b: this.power() };
    }
    return a;
  }
  private power(): Node {
    let a = this.percent();
    while (this.isOp('^')) {
      this.next();
      a = { t: 'bin', op: '^', a, b: this.percent() };
    }
    return a;
  }
  private percent(): Node {
    let a = this.unary();
    while (this.isOp('%')) {
      this.next();
      a = { t: 'pct', a };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp('-')) {
      this.next();
      return { t: 'neg', a: this.unary() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.unary();
    }
    return this.primary();
  }
  private primary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'num':
        return { t: 'num', v: t.value as number };
      case 'str':
        return { t: 'str', v: t.value as string };
      case 'bool':
        return { t: 'bool', v: t.value as boolean };
      case 'err':
        return { t: 'err', v: t.value as string };
      case 'name':
        return { t: 'name', v: t.value as string };
      case 'ref': {
        const r = parseRefText(t.ref!);
        if (!r) return { t: 'err', v: '#REF!' };
        return { t: 'ref', sheet: t.sheet ?? null, ...r };
      }
      case 'lp': {
        const n = this.comparison();
        const c = this.next();
        if (c.type !== 'rp') throw new FormulaSyntaxError('Falta fechar um parêntese ")"');
        return n;
      }
      case 'func': {
        let name = String(t.value);
        if (name.startsWith('_XLFN.')) name = name.slice(6);
        const open = this.next();
        if (open.type !== 'lp') throw new FormulaSyntaxError('Esperado "(" depois do nome da função');
        const args: Node[] = [];
        if (this.peek()?.type === 'rp') {
          this.next();
          return { t: 'func', name, args };
        }
        for (;;) {
          // Argumento vazio, ex: SE(A1;;2)
          if (this.peek()?.type === 'sep' || this.peek()?.type === 'rp') {
            args.push({ t: 'name', v: '' });
          } else {
            args.push(this.comparison());
          }
          const sep = this.next();
          if (sep.type === 'rp') break;
          if (sep.type !== 'sep') throw new FormulaSyntaxError('Esperado ";" ou ")" entre os argumentos');
        }
        return { t: 'func', name, args };
      }
      default:
        throw new FormulaSyntaxError(`Não entendi "${t.text}" nesta posição`);
    }
  }
}

/** Analisa uma fórmula canônica (sem "="). */
export function parseFormula(canonical: string): Node {
  const toks = tokenize(canonical, 'en').filter((t) => t.type !== 'ws');
  return new Parser(toks).parse();
}

/** Lista as referências usadas por uma AST. */
export function collectRefs(n: Node, out: RefNode[] = []): RefNode[] {
  switch (n.t) {
    case 'ref':
      out.push(n);
      break;
    case 'func':
      for (const a of n.args) collectRefs(a, out);
      break;
    case 'bin':
      collectRefs(n.a, out);
      collectRefs(n.b, out);
      break;
    case 'neg':
    case 'pct':
      collectRefs(n.a, out);
      break;
  }
  return out;
}

export function usesFunctions(n: Node, out: Set<string> = new Set()): Set<string> {
  switch (n.t) {
    case 'func':
      out.add(n.name);
      for (const a of n.args) usesFunctions(a, out);
      break;
    case 'bin':
      usesFunctions(n.a, out);
      usesFunctions(n.b, out);
      break;
    case 'neg':
    case 'pct':
      usesFunctions(n.a, out);
      break;
  }
  return out;
}
