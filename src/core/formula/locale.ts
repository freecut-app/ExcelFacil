// Tradução entre a fórmula exibida (pt-BR) e a fórmula interna (canônica, em inglês,
// idêntica à usada pelo formato .xlsx). Veja docs/FORMULAS.md.

import { errorToLocale, Locale, quoteSheetName, tokenize, Token } from './tokenizer';

// Nome canônico (interno / .xlsx) -> nome exibido em português.
export const FUNC_PT: Record<string, string> = {
  SUM: 'SOMA',
  AVERAGE: 'MÉDIA',
  MIN: 'MÍNIMO',
  MAX: 'MÁXIMO',
  COUNT: 'CONT.NÚM',
  COUNTA: 'CONT.VALORES',
  COUNTBLANK: 'CONTAR.VAZIO',
  IF: 'SE',
  IFERROR: 'SEERRO',
  AND: 'E',
  OR: 'OU',
  NOT: 'NÃO',
  ROUND: 'ARRED',
  ROUNDUP: 'ARREDONDAR.PARA.CIMA',
  ROUNDDOWN: 'ARREDONDAR.PARA.BAIXO',
  INT: 'INT',
  ABS: 'ABS',
  SQRT: 'RAIZ',
  POWER: 'POTÊNCIA',
  MOD: 'MOD',
  PRODUCT: 'MULT',
  MEDIAN: 'MED',
  SUMIF: 'SOMASE',
  COUNTIF: 'CONT.SE',
  AVERAGEIF: 'MÉDIASE',
  VLOOKUP: 'PROCV',
  CONCATENATE: 'CONCATENAR',
  CONCAT: 'CONCAT',
  LEFT: 'ESQUERDA',
  RIGHT: 'DIREITA',
  MID: 'EXT.TEXTO',
  LEN: 'NÚM.CARACT',
  UPPER: 'MAIÚSCULA',
  LOWER: 'MINÚSCULA',
  TRIM: 'ARRUMAR',
  TODAY: 'HOJE',
  NOW: 'AGORA',
  DATE: 'DATA',
  YEAR: 'ANO',
  MONTH: 'MÊS',
  DAY: 'DIA',
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Nome digitado em português (com ou sem acento) -> canônico.
export const FUNC_FROM_PT: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [en, pt] of Object.entries(FUNC_PT)) {
    m[pt] = en;
    m[stripAccents(pt)] = en;
  }
  // Nomes em inglês também são aceitos quando não conflitam.
  for (const en of Object.keys(FUNC_PT)) if (!(en in m)) m[en] = en;
  return m;
})();

export const SUPPORTED_FUNCS = new Set(Object.keys(FUNC_PT));

function translateToken(t: Token, to: Locale): string {
  switch (t.type) {
    case 'num':
      return to === 'pt' ? t.text.replace('.', ',') : t.text.replace(',', '.');
    case 'bool':
      return to === 'pt' ? (t.value ? 'VERDADEIRO' : 'FALSO') : t.value ? 'TRUE' : 'FALSE';
    case 'err':
      return errorToLocale(String(t.value), to);
    case 'sep':
      return to === 'pt' ? ';' : ',';
    case 'func': {
      const up = String(t.value);
      if (to === 'pt') {
        const bare = up.startsWith('_XLFN.') ? up.slice(6) : up;
        return FUNC_PT[bare] ?? bare;
      }
      return FUNC_FROM_PT[up] ?? FUNC_FROM_PT[stripAccents(up)] ?? up;
    }
    case 'ref':
      return (t.sheet != null ? quoteSheetName(t.sheet) + '!' : '') + (t.ref ?? '').toUpperCase();
    default:
      return t.text;
  }
}

/** Fórmula interna (sem "=") -> texto exibido em português (sem "="). */
export function toDisplay(canonical: string): string {
  try {
    return tokenize(canonical, 'en')
      .map((t) => translateToken(t, 'pt'))
      .join('');
  } catch {
    return canonical;
  }
}

/** Texto digitado em português (sem "=") -> fórmula interna. Lança FormulaSyntaxError. */
export function fromDisplay(display: string): string {
  return tokenize(display, 'pt')
    .map((t) => translateToken(t, 'en'))
    .join('');
}

export function displayFuncName(canonical: string): string {
  return FUNC_PT[canonical] ?? canonical;
}
