// Tokenizador de fórmulas. Funciona em dois "dialetos":
//  - 'en'  (canônico, igual ao que o .xlsx guarda): SUM(A1,2.5)
//  - 'pt'  (o que a pessoa digita e vê):            SOMA(A1;2,5)
// Os espaços são preservados como tokens para que a tradução entre
// dialetos não altere a forma como a pessoa escreveu a fórmula.

export type Locale = 'pt' | 'en';

export type TokType =
  | 'num'
  | 'str'
  | 'bool'
  | 'err'
  | 'ref' // célula ou intervalo, opcionalmente com nome de aba
  | 'func' // identificador seguido de '('
  | 'name' // identificador solto (nome desconhecido)
  | 'op'
  | 'lp'
  | 'rp'
  | 'sep'
  | 'ws';

export interface Token {
  type: TokType;
  text: string; // texto original
  value?: number | string | boolean;
  sheet?: string | null; // para 'ref'
  ref?: string; // parte da referência sem a aba, ex: $A$1:B2
}

export class FormulaSyntaxError extends Error {}

const ERRORS_EN = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!'];
const ERRORS_PT = ['#DIV/0!', '#VALOR!', '#REF!', '#NOME?', '#N/D', '#NÚM!', '#NULO!'];

export function errorToLocale(code: string, to: Locale): string {
  const fromList = to === 'pt' ? ERRORS_EN : ERRORS_PT;
  const toList = to === 'pt' ? ERRORS_PT : ERRORS_EN;
  const i = fromList.indexOf(code.toUpperCase());
  return i >= 0 ? toList[i] : code;
}

const IDENT_START = /[A-Za-z_À-ɏ]/;
const IDENT_CHAR = /[A-Za-z0-9_.À-ɏ]/;
const CELL_PART = '\\$?[A-Za-z]{1,3}\\$?[0-9]{1,7}';
const COL_PART = '\\$?[A-Za-z]{1,3}';
const RE_CELL_RANGE = new RegExp(`^(${CELL_PART})(?::(${CELL_PART}))?`);
const RE_COL_RANGE = new RegExp(`^(${COL_PART}):(${COL_PART})`);
const RE_NUM_EN = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;
const RE_NUM_PT = /^(\d+(,\d*)?|,\d+)([eE][+-]?\d+)?/;
const RE_UNQUOTED_SHEET = /^([A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*)!/;

function boolWords(locale: Locale): [string, string] {
  return locale === 'pt' ? ['VERDADEIRO', 'FALSO'] : ['TRUE', 'FALSE'];
}

export function tokenize(src: string, locale: Locale): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  const decimalRe = locale === 'pt' ? RE_NUM_PT : RE_NUM_EN;
  const sepChar = locale === 'pt' ? ';' : ',';
  const [T, F] = boolWords(locale);

  const tryRef = (sheet: string | null, start: number): boolean => {
    const rest = src.slice(i);
    let m = RE_CELL_RANGE.exec(rest);
    let len = 0;
    if (m) {
      len = m[0].length;
    } else {
      m = RE_COL_RANGE.exec(rest);
      if (m) len = m[0].length;
    }
    if (!m) return false;
    const next = src[i + len];
    if (next !== undefined && (IDENT_CHAR.test(next) || next === '(' || next === '!')) return false;
    out.push({ type: 'ref', text: src.slice(start, i + len), sheet, ref: m[0] });
    i += len;
    return true;
  };

  while (i < n) {
    const ch = src[i];
    const start = i;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      while (i < n && /\s/.test(src[i])) i++;
      out.push({ type: 'ws', text: src.slice(start, i) });
      continue;
    }

    if (ch === '"') {
      i++;
      let s = '';
      for (;;) {
        if (i >= n) throw new FormulaSyntaxError('Texto sem aspas de fechamento');
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ type: 'str', text: src.slice(start, i), value: s });
      continue;
    }

    if (ch === "'") {
      // Nome de aba entre aspas simples: 'Minha aba'!A1
      i++;
      let name = '';
      for (;;) {
        if (i >= n) throw new FormulaSyntaxError('Nome de aba sem aspas de fechamento');
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            name += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        name += src[i++];
      }
      if (src[i] !== '!') throw new FormulaSyntaxError('Esperado "!" depois do nome da aba');
      i++;
      if (!tryRef(name, start)) {
        throw new FormulaSyntaxError('Referência inválida depois do nome da aba');
      }
      continue;
    }

    if (ch === '#') {
      const rest = src.slice(i).toUpperCase();
      const all = [...ERRORS_EN, ...ERRORS_PT];
      const found = all.find((e) => rest.startsWith(e));
      if (!found) throw new FormulaSyntaxError('Código de erro desconhecido');
      i += found.length;
      out.push({ type: 'err', text: src.slice(start, i), value: errorToLocale(found, 'en') });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === (locale === 'pt' ? ',' : '.') && /[0-9]/.test(src[i + 1] ?? ''))) {
      // Pode ser número ou referência tipo "1:1" (não suportado) — tratamos como número.
      const m = decimalRe.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        const norm = m[0].replace(',', '.');
        out.push({ type: 'num', text: m[0], value: parseFloat(norm) });
        continue;
      }
    }

    if (ch === '$' || IDENT_START.test(ch)) {
      // Aba sem aspas: Plan1!A1
      const sm = RE_UNQUOTED_SHEET.exec(src.slice(i));
      if (sm) {
        i += sm[0].length;
        if (!tryRef(sm[1], start)) throw new FormulaSyntaxError('Referência inválida depois do nome da aba');
        continue;
      }
      if (tryRef(null, start)) continue;
      if (ch === '$') throw new FormulaSyntaxError('Referência inválida');
      while (i < n && IDENT_CHAR.test(src[i])) i++;
      const word = src.slice(start, i);
      let j = i;
      while (j < n && src[j] === ' ') j++;
      if (src[j] === '(') {
        out.push({ type: 'func', text: word, value: word.toUpperCase() });
        continue;
      }
      const up = word.toUpperCase();
      if (up === T || up === F || up === 'TRUE' || up === 'FALSE') {
        out.push({ type: 'bool', text: word, value: up === T || up === 'TRUE' });
        continue;
      }
      out.push({ type: 'name', text: word, value: up });
      continue;
    }

    if (ch === '(') {
      out.push({ type: 'lp', text: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      out.push({ type: 'rp', text: ch });
      i++;
      continue;
    }
    if (ch === sepChar) {
      out.push({ type: 'sep', text: ch });
      i++;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ type: 'op', text: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(ch)) {
      out.push({ type: 'op', text: ch });
      i++;
      continue;
    }
    if (locale === 'pt' && ch === ',') {
      throw new FormulaSyntaxError('Use ponto e vírgula (;) para separar os argumentos');
    }
    throw new FormulaSyntaxError(`Caractere inesperado: "${ch}"`);
  }
  return out;
}

export function quoteSheetName(name: string): string {
  if (/^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*$/.test(name) && !/^[A-Za-z]{1,3}[0-9]+$/.test(name)) {
    return name;
  }
  return "'" + name.replace(/'/g, "''") + "'";
}
