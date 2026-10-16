// Formatação de valores no padrão brasileiro e interpretação do que a pessoa digita.

import { CellStyle, isError, NumFmt, Scalar, Value } from './model';
import { errorToLocale } from './formula/tokenizer';

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export function dateToSerial(y: number, m: number, d: number): number {
  return (Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / DAY_MS;
}

export function serialToDate(serial: number): { y: number; m: number; d: number } {
  const dt = new Date(EXCEL_EPOCH + Math.floor(serial) * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function todaySerial(): number {
  const now = new Date();
  return dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Número no formato brasileiro: 1.234,56 */
export function formatNumberBR(n: number, decimals: number | undefined, grouping = true): string {
  if (!isFinite(n)) return errorToLocale('#NUM!', 'pt');
  let s: string;
  if (decimals === undefined) {
    // Formato "geral": até 10 dígitos significativos, sem zeros à direita.
    if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-9)) {
      return n.toExponential(4).replace('.', ',').replace('e+', 'E+').replace('e-', 'E-');
    }
    s = parseFloat(n.toPrecision(12)).toString();
    if (s.includes('e')) s = n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  } else {
    s = n.toFixed(decimals);
  }
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  let [ip, dp] = s.split('.');
  if (grouping) ip = groupThousands(ip);
  let out = dp ? ip + ',' + dp : ip;
  if (neg && /[1-9]/.test(out)) out = '-' + out;
  return out;
}

export function formatDateBR(serial: number): string {
  const { y, m, d } = serialToDate(serial);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function errorText(v: { err: string }): string {
  if (v.err === '#CIRC!') return '#CIRCULAR!';
  return errorToLocale(v.err, 'pt');
}

/** Explicação simples para cada erro, mostrada para a pessoa. */
export function errorExplanation(code: string): string {
  switch (code) {
    case '#DIV/0!':
      return 'Divisão por zero: o número de baixo da divisão está vazio ou é zero.';
    case '#VALUE!':
      return 'Tipo de valor errado: a fórmula tentou fazer conta com um texto.';
    case '#REF!':
      return 'Referência inválida: a fórmula aponta para uma célula ou aba que foi excluída.';
    case '#NAME?':
      return 'Nome desconhecido: confira se o nome da função está escrito corretamente (ex.: SOMA, MÉDIA).';
    case '#N/A':
      return 'Valor não encontrado: a busca não achou o que procurava.';
    case '#NUM!':
      return 'Número inválido: o resultado é grande demais ou a conta não é possível.';
    case '#CIRC!':
      return 'Referência circular: a fórmula depende do próprio resultado. Remova a célula da própria fórmula.';
    case '#SYNTAX!':
      return 'A fórmula está escrita de forma incorreta.';
    default:
      return 'Não foi possível calcular esta fórmula.';
  }
}

export function displayScalarBR(v: Value): string {
  if (v === null || v === undefined) return '';
  if (isError(v)) return errorText(v);
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (typeof v === 'number') return formatNumberBR(v, undefined, false);
  return v;
}

/** Texto exibido na célula, aplicando o formato numérico do estilo. */
export function formatValue(v: Value, s: CellStyle | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return displayScalarBR(v);
  const fmt: NumFmt = s?.fmt ?? 'general';
  const dec = s?.dec;
  switch (fmt) {
    case 'currency': {
      const t = formatNumberBR(Math.abs(v), dec ?? 2);
      return (v < 0 && /[1-9]/.test(t) ? '-' : '') + 'R$ ' + t;
    }
    case 'percent':
      return formatNumberBR(v * 100, dec ?? 0) + '%';
    case 'number':
      return formatNumberBR(v, dec ?? 2);
    case 'date':
      return formatDateBR(v);
    case 'text':
      return formatNumberBR(v, undefined, false);
    default:
      return dec !== undefined ? formatNumberBR(v, dec) : formatNumberBR(v, undefined, false);
  }
}

/** Valor digitado na barra de edição (para editar uma célula existente). */
export function editTextForValue(v: Scalar | undefined, s: CellStyle | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (typeof v === 'number') {
    if (s?.fmt === 'date') return formatDateBR(v);
    if (s?.fmt === 'percent') return formatNumberBR(v * 100, undefined, false) + '%';
    return formatNumberBR(v, undefined, false);
  }
  return v;
}

/** Converte texto em número aceitando o padrão brasileiro (1.234,56) e também 1234.56. */
export function parseNumberBR(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  // 1.234.567,89 | 1234,5 | -12
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  if (/^[-+]?\d+(,\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
  if (/^[-+]?,\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
  // 1234.5 (ponto como decimal, comum ao colar de outros programas)
  if (/^[-+]?\d+\.\d+$/.test(t) && !/^[-+]?\d{1,3}\.\d{3}$/.test(t)) return parseFloat(t);
  if (/^[-+]?\d+(\.\d+)?[eE][-+]?\d+$/.test(t)) return parseFloat(t);
  return null;
}

export interface ParsedInput {
  v: Scalar;
  f?: string; // fórmula em português (sem "="), ainda não convertida
  fmt?: NumFmt;
  dec?: number;
}

/** Interpreta o que a pessoa digitou numa célula. */
export function parseInput(raw: string, current?: CellStyle): ParsedInput {
  const text = raw;
  if (text.startsWith('=') && text.length > 1) return { v: null, f: text.slice(1) };
  const t = text.trim();
  if (t === '') return { v: null };
  if (current?.fmt === 'text') return { v: text };
  if (text.startsWith("'")) return { v: text.slice(1) };

  const up = t.toUpperCase();
  if (up === 'VERDADEIRO') return { v: true };
  if (up === 'FALSO') return { v: false };

  // Moeda: R$ 1.234,56 ou -R$ 10
  const cur = /^(-)?\s*R\$\s*(-)?\s*(.+)$/i.exec(t);
  if (cur) {
    const n = parseNumberBR(cur[3]);
    if (n !== null) {
      const neg = !!cur[1] !== !!cur[2];
      return { v: neg ? -n : n, fmt: 'currency', dec: current?.fmt === 'currency' ? current.dec : 2 };
    }
  }
  // Porcentagem: 15% ou 12,5%
  const pct = /^(.+?)\s*%$/.exec(t);
  if (pct) {
    const n = parseNumberBR(pct[1]);
    if (n !== null) {
      const dec = (pct[1].split(',')[1] ?? '').length;
      return { v: n / 100, fmt: 'percent', dec: current?.fmt === 'percent' ? current.dec : dec };
    }
  }
  // Data: 16/10/2026 ou 16/10/26 ou 16-10-2026
  const dm = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(t);
  if (dm) {
    const d = +dm[1];
    const m = +dm[2];
    let y = +dm[3];
    if (dm[3].length === 2) y += y < 50 ? 2000 : 1900;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const serial = dateToSerial(y, m, d);
      const back = serialToDate(serial);
      if (back.d === d && back.m === m) return { v: serial, fmt: 'date' };
    }
  }
  const n = parseNumberBR(t);
  if (n !== null) return { v: n };
  return { v: text };
}
