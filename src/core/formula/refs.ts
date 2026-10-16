// Reescrita de referências dentro de fórmulas canônicas.

import { colToLetters, lettersToCol, MAX_COLS, MAX_ROWS, Range } from '../address';
import { quoteSheetName, tokenize, Token } from './tokenizer';

interface Endpoint {
  col: number;
  row: number | null; // null = referência de coluna inteira (A:A)
  absC: boolean;
  absR: boolean;
}

const EP_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d*)$/;

function parseEndpoint(s: string): Endpoint | null {
  const m = EP_RE.exec(s);
  if (!m) return null;
  return {
    absC: m[1] === '$',
    col: lettersToCol(m[2]),
    absR: m[3] === '$',
    row: m[4] ? parseInt(m[4], 10) - 1 : null,
  };
}

function writeEndpoint(e: Endpoint): string {
  return (e.absC ? '$' : '') + colToLetters(e.col) + (e.row === null ? '' : (e.absR ? '$' : '') + (e.row + 1));
}

function refPrefix(t: Token): string {
  return t.sheet != null ? quoteSheetName(t.sheet) + '!' : '';
}

/** Reescreve cada token de referência. O callback devolve as novas pontas ou null para #REF!. */
function mapRefs(formula: string, fn: (eps: Endpoint[], t: Token) => Endpoint[] | null): string {
  let toks: Token[];
  try {
    toks = tokenize(formula, 'en');
  } catch {
    return formula;
  }
  return toks
    .map((t) => {
      if (t.type !== 'ref') return t.text;
      const parts = t.ref!.split(':');
      const eps = parts.map(parseEndpoint);
      if (eps.some((e) => !e)) return t.text;
      const res = fn(eps as Endpoint[], t);
      if (!res) return '#REF!';
      return refPrefix(t) + res.map(writeEndpoint).join(':');
    })
    .join('');
}

/** Desloca as referências relativas (usado ao copiar/colar e preencher). */
export function shiftFormula(formula: string, dr: number, dc: number): string {
  if (dr === 0 && dc === 0) return formula;
  return mapRefs(formula, (eps) => {
    const out: Endpoint[] = [];
    for (const e of eps) {
      const n = { ...e };
      if (!e.absC) n.col = e.col + dc;
      if (e.row !== null && !e.absR) n.row = e.row + dr;
      if (n.col < 0 || n.col >= MAX_COLS) return null;
      if (n.row !== null && (n.row < 0 || n.row >= MAX_ROWS)) return null;
      out.push(n);
    }
    return out;
  });
}

function pointsTo(t: Token, targetSheet: string, formulaSheet: string): boolean {
  const s = t.sheet ?? formulaSheet;
  return s.toLowerCase() === targetSheet.toLowerCase();
}

export interface StructOp {
  sheet: string; // aba onde linhas/colunas foram inseridas ou excluídas
  axis: 'row' | 'col';
  at: number;
  count: number; // > 0 inserir, < 0 excluir
}

/** Ajusta referências depois de inserir/excluir linhas ou colunas. */
export function adjustFormula(formula: string, formulaSheet: string, op: StructOp): string {
  return mapRefs(formula, (eps, t) => {
    if (!pointsTo(t, op.sheet, formulaSheet)) return eps;
    const isRow = op.axis === 'row';
    const get = (e: Endpoint) => (isRow ? e.row : e.col);
    const set = (e: Endpoint, v: number) => (isRow ? { ...e, row: v } : { ...e, col: v });
    if (isRow && eps.some((e) => e.row === null)) return eps; // coluna inteira: não muda com linhas
    if (op.count > 0) {
      return eps.map((e) => {
        const v = get(e)!;
        // Num intervalo, inserir exatamente no início empurra o intervalo inteiro.
        return v >= op.at ? set(e, v + op.count) : e;
      });
    }
    const del = -op.count;
    const lo = op.at;
    const hi = op.at + del - 1;
    if (eps.length === 1) {
      const v = get(eps[0])!;
      if (v >= lo && v <= hi) return null;
      return [v > hi ? set(eps[0], v - del) : eps[0]];
    }
    const a = get(eps[0])!;
    const b = get(eps[1])!;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (start >= lo && end <= hi) return null;
    const ns = start < lo ? start : start > hi ? start - del : lo;
    const ne = end < lo ? end : end > hi ? end - del : lo - 1;
    if (ne < ns) return null;
    return [set(eps[0], a <= b ? ns : ne), set(eps[1], a <= b ? ne : ns)];
  });
}

/** Troca o nome de uma aba nas referências. */
export function renameSheetInFormula(formula: string, oldName: string, newName: string): string {
  let toks: Token[];
  try {
    toks = tokenize(formula, 'en');
  } catch {
    return formula;
  }
  return toks
    .map((t) => {
      if (t.type === 'ref' && t.sheet != null && t.sheet.toLowerCase() === oldName.toLowerCase()) {
        return quoteSheetName(newName) + '!' + t.ref;
      }
      return t.text;
    })
    .join('');
}

/** Marca como #REF! todas as referências para uma aba excluída. */
export function removeSheetInFormula(formula: string, name: string): string {
  return mapRefs(formula, (eps, t) => (t.sheet != null && t.sheet.toLowerCase() === name.toLowerCase() ? null : eps));
}

/**
 * Depois de recortar e colar: referências que apontavam para o bloco movido passam a
 * apontar para o novo lugar (somente células isoladas e intervalos totalmente dentro do bloco).
 */
export function moveRefsInFormula(
  formula: string,
  formulaSheet: string,
  srcSheet: string,
  src: Range,
  dstSheet: string,
  dr: number,
  dc: number,
): string {
  let changed = false;
  let toks: Token[];
  try {
    toks = tokenize(formula, 'en');
  } catch {
    return formula;
  }
  const out = toks.map((t) => {
    if (t.type !== 'ref' || !pointsTo(t, srcSheet, formulaSheet)) return t.text;
    const eps = t.ref!.split(':').map(parseEndpoint);
    if (eps.some((e) => !e || e.row === null)) return t.text;
    const inside = (eps as Endpoint[]).every((e) => e.row! >= src.r1 && e.row! <= src.r2 && e.col >= src.c1 && e.col <= src.c2);
    if (!inside) return t.text;
    changed = true;
    const moved = (eps as Endpoint[]).map((e) => ({ ...e, row: e.row! + dr, col: e.col + dc }));
    const needPrefix = t.sheet != null || dstSheet.toLowerCase() !== formulaSheet.toLowerCase();
    const prefix = needPrefix ? quoteSheetName(dstSheet) + '!' : '';
    return prefix + moved.map(writeEndpoint).join(':');
  });
  return changed ? out.join('') : formula;
}

/** Converte F4: alterna entre A1 -> $A$1 -> A$1 -> $A1 -> A1 na referência sob o cursor. */
export function cycleAbsolute(ref: string): string {
  const eps = ref.split(':').map(parseEndpoint);
  if (eps.some((e) => !e)) return ref;
  return (eps as Endpoint[])
    .map((e) => {
      let n: Endpoint;
      if (!e.absC && !e.absR) n = { ...e, absC: true, absR: true };
      else if (e.absC && e.absR) n = { ...e, absC: false, absR: true };
      else if (!e.absC && e.absR) n = { ...e, absC: true, absR: false };
      else n = { ...e, absC: false, absR: false };
      return writeEndpoint(n);
    })
    .join(':');
}

