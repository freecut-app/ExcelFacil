// Endereçamento de células: colunas por letras (A..XFD), linhas por números (1..).
// Internamente linhas e colunas são índices a partir de 0.

export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export function colToLetters(col: number): string {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function lettersToCol(letters: string): number {
  let n = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) n = n * 26 + (up.charCodeAt(i) - 64);
  return n - 1;
}

export function cellKey(row: number, col: number): number {
  // Chave numérica compacta: cabe com folga em 2^53.
  return row * MAX_COLS + col;
}

export function keyRow(key: number): number {
  return Math.floor(key / MAX_COLS);
}

export function keyCol(key: number): number {
  return key % MAX_COLS;
}

export function addr(row: number, col: number): string {
  return colToLetters(col) + (row + 1);
}

export interface CellRef {
  row: number;
  col: number;
}

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export function normRange(r: Range): Range {
  return {
    r1: Math.min(r.r1, r.r2),
    c1: Math.min(r.c1, r.c2),
    r2: Math.max(r.r1, r.r2),
    c2: Math.max(r.c1, r.c2),
  };
}

export function rangeToA1(r: Range): string {
  const n = normRange(r);
  const a = addr(n.r1, n.c1);
  if (n.r1 === n.r2 && n.c1 === n.c2) return a;
  return a + ':' + addr(n.r2, n.c2);
}

const A1_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

export function parseA1(s: string): CellRef | null {
  const m = A1_RE.exec(s.trim());
  if (!m) return null;
  const col = lettersToCol(m[1]);
  const row = parseInt(m[2], 10) - 1;
  if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) return null;
  return { row, col };
}

export function parseRangeA1(s: string): Range | null {
  const parts = s.trim().split(':');
  if (parts.length === 1) {
    const a = parseA1(parts[0]);
    return a ? { r1: a.row, c1: a.col, r2: a.row, c2: a.col } : null;
  }
  if (parts.length !== 2) return null;
  const a = parseA1(parts[0]);
  const b = parseA1(parts[1]);
  if (!a || !b) return null;
  return normRange({ r1: a.row, c1: a.col, r2: b.row, c2: b.col });
}

export function inRange(r: Range, row: number, col: number): boolean {
  return row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
}

export function rangeSize(r: Range): number {
  return (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
}
