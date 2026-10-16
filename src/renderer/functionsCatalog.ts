// Descrição das funções em português (usada no autocompletar e em "Inserir função").

export interface FuncDoc {
  pt: string;
  args: string;
  desc: string;
  example: string;
  cat: 'Básicas' | 'Lógicas' | 'Matemática' | 'Texto' | 'Data' | 'Procura';
}

export const FUNCS: FuncDoc[] = [
  { pt: 'SOMA', args: 'número1; [número2]; …', desc: 'Soma os números.', example: '=SOMA(B2:B10)', cat: 'Básicas' },
  { pt: 'MÉDIA', args: 'número1; [número2]; …', desc: 'Calcula a média (soma dividida pela quantidade).', example: '=MÉDIA(B2:B10)', cat: 'Básicas' },
  { pt: 'MÍNIMO', args: 'número1; [número2]; …', desc: 'Mostra o menor valor.', example: '=MÍNIMO(B2:B10)', cat: 'Básicas' },
  { pt: 'MÁXIMO', args: 'número1; [número2]; …', desc: 'Mostra o maior valor.', example: '=MÁXIMO(B2:B10)', cat: 'Básicas' },
  { pt: 'CONT.NÚM', args: 'valor1; [valor2]; …', desc: 'Conta quantas células têm números.', example: '=CONT.NÚM(B2:B10)', cat: 'Básicas' },
  { pt: 'CONT.VALORES', args: 'valor1; [valor2]; …', desc: 'Conta quantas células não estão vazias.', example: '=CONT.VALORES(A2:A10)', cat: 'Básicas' },
  { pt: 'CONTAR.VAZIO', args: 'intervalo', desc: 'Conta quantas células estão vazias.', example: '=CONTAR.VAZIO(A2:A10)', cat: 'Básicas' },
  { pt: 'SE', args: 'teste; valor_se_verdadeiro; [valor_se_falso]', desc: 'Escolhe um resultado conforme uma condição.', example: '=SE(D2>100;"Alto";"Baixo")', cat: 'Lógicas' },
  { pt: 'SEERRO', args: 'valor; valor_se_erro', desc: 'Mostra outro valor quando a conta dá erro.', example: '=SEERRO(A2/B2;0)', cat: 'Lógicas' },
  { pt: 'E', args: 'teste1; [teste2]; …', desc: 'VERDADEIRO se todas as condições forem verdadeiras.', example: '=E(A2>0;B2>0)', cat: 'Lógicas' },
  { pt: 'OU', args: 'teste1; [teste2]; …', desc: 'VERDADEIRO se alguma condição for verdadeira.', example: '=OU(A2="Sim";B2="Sim")', cat: 'Lógicas' },
  { pt: 'NÃO', args: 'teste', desc: 'Inverte VERDADEIRO e FALSO.', example: '=NÃO(A2>10)', cat: 'Lógicas' },
  { pt: 'SOMASE', args: 'intervalo; critério; [intervalo_soma]', desc: 'Soma só o que atende a um critério.', example: '=SOMASE(C2:C20;"Casa";D2:D20)', cat: 'Básicas' },
  { pt: 'CONT.SE', args: 'intervalo; critério', desc: 'Conta só o que atende a um critério.', example: '=CONT.SE(B2:B20;">100")', cat: 'Básicas' },
  { pt: 'MÉDIASE', args: 'intervalo; critério; [intervalo_média]', desc: 'Média só do que atende a um critério.', example: '=MÉDIASE(C2:C20;"Casa";D2:D20)', cat: 'Básicas' },
  { pt: 'ARRED', args: 'número; casas_decimais', desc: 'Arredonda um número.', example: '=ARRED(A2;2)', cat: 'Matemática' },
  { pt: 'ARREDONDAR.PARA.CIMA', args: 'número; casas_decimais', desc: 'Arredonda sempre para cima.', example: '=ARREDONDAR.PARA.CIMA(A2;0)', cat: 'Matemática' },
  { pt: 'ARREDONDAR.PARA.BAIXO', args: 'número; casas_decimais', desc: 'Arredonda sempre para baixo.', example: '=ARREDONDAR.PARA.BAIXO(A2;0)', cat: 'Matemática' },
  { pt: 'INT', args: 'número', desc: 'Parte inteira do número (arredonda para baixo).', example: '=INT(7,8)', cat: 'Matemática' },
  { pt: 'ABS', args: 'número', desc: 'Valor sem o sinal de negativo.', example: '=ABS(A2)', cat: 'Matemática' },
  { pt: 'RAIZ', args: 'número', desc: 'Raiz quadrada.', example: '=RAIZ(16)', cat: 'Matemática' },
  { pt: 'POTÊNCIA', args: 'número; potência', desc: 'Eleva um número a uma potência.', example: '=POTÊNCIA(2;3)', cat: 'Matemática' },
  { pt: 'MOD', args: 'número; divisor', desc: 'Resto da divisão.', example: '=MOD(10;3)', cat: 'Matemática' },
  { pt: 'MULT', args: 'número1; [número2]; …', desc: 'Multiplica os números.', example: '=MULT(A2:A5)', cat: 'Matemática' },
  { pt: 'MED', args: 'número1; [número2]; …', desc: 'Valor do meio (mediana).', example: '=MED(B2:B10)', cat: 'Matemática' },
  { pt: 'PROCV', args: 'valor_procurado; tabela; nº_coluna; [aproximado]', desc: 'Procura um valor na primeira coluna e devolve outra coluna da mesma linha. Use FALSO para busca exata.', example: '=PROCV("Arroz";A2:D50;4;FALSO)', cat: 'Procura' },
  { pt: 'CONCATENAR', args: 'texto1; [texto2]; …', desc: 'Junta textos.', example: '=CONCATENAR(A2;" ";B2)', cat: 'Texto' },
  { pt: 'ESQUERDA', args: 'texto; [quantidade]', desc: 'Primeiros caracteres de um texto.', example: '=ESQUERDA(A2;3)', cat: 'Texto' },
  { pt: 'DIREITA', args: 'texto; [quantidade]', desc: 'Últimos caracteres de um texto.', example: '=DIREITA(A2;4)', cat: 'Texto' },
  { pt: 'EXT.TEXTO', args: 'texto; início; quantidade', desc: 'Pedaço do meio de um texto.', example: '=EXT.TEXTO(A2;2;3)', cat: 'Texto' },
  { pt: 'NÚM.CARACT', args: 'texto', desc: 'Quantidade de caracteres.', example: '=NÚM.CARACT(A2)', cat: 'Texto' },
  { pt: 'MAIÚSCULA', args: 'texto', desc: 'Converte para LETRAS MAIÚSCULAS.', example: '=MAIÚSCULA(A2)', cat: 'Texto' },
  { pt: 'MINÚSCULA', args: 'texto', desc: 'Converte para letras minúsculas.', example: '=MINÚSCULA(A2)', cat: 'Texto' },
  { pt: 'ARRUMAR', args: 'texto', desc: 'Remove espaços extras.', example: '=ARRUMAR(A2)', cat: 'Texto' },
  { pt: 'HOJE', args: '', desc: 'Data de hoje.', example: '=HOJE()', cat: 'Data' },
  { pt: 'AGORA', args: '', desc: 'Data e hora de agora.', example: '=AGORA()', cat: 'Data' },
  { pt: 'DATA', args: 'ano; mês; dia', desc: 'Monta uma data.', example: '=DATA(2026;10;16)', cat: 'Data' },
  { pt: 'ANO', args: 'data', desc: 'Ano de uma data.', example: '=ANO(A2)', cat: 'Data' },
  { pt: 'MÊS', args: 'data', desc: 'Mês de uma data (1 a 12).', example: '=MÊS(A2)', cat: 'Data' },
  { pt: 'DIA', args: 'data', desc: 'Dia de uma data.', example: '=DIA(A2)', cat: 'Data' },
];

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function findFunc(name: string): FuncDoc | undefined {
  const n = strip(name);
  return FUNCS.find((f) => strip(f.pt) === n);
}

export function matchFuncs(prefix: string): FuncDoc[] {
  const p = strip(prefix);
  if (!p) return [];
  return FUNCS.filter((f) => strip(f.pt).startsWith(p)).slice(0, 8);
}

/** Analisa o texto até o cursor: palavra sendo digitada e função cujos parênteses estão abertos. */
export function formulaContext(text: string, caret: number): { word: string; wordStart: number; openFunc: string | null; argIndex: number } {
  const before = text.slice(0, caret);
  let word = '';
  let wordStart = caret;
  const m = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.]*)$/.exec(before);
  if (m) {
    const prev = before[before.length - m[1].length - 1];
    // Só sugere função depois de "=", operador, "(" ou ";" — e não se for referência tipo B2.
    if ((prev === undefined || /[=+\-*/^&(;<> ]/.test(prev)) && !/^[A-Za-z]{1,3}\d+$/.test(m[1])) {
      word = m[1];
      wordStart = caret - m[1].length;
    }
  }
  // Função aberta mais interna
  let depth = 0;
  let argIndex = 0;
  let inStr = false;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === ')') depth++;
    else if (ch === ';' && depth === 0) argIndex++;
    else if (ch === '(') {
      if (depth === 0) {
        const fm = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.]*)\s*$/.exec(before.slice(0, i));
        return { word, wordStart, openFunc: fm ? fm[1] : null, argIndex };
      }
      depth--;
    }
  }
  return { word, wordStart, openFunc: null, argIndex: 0 };
}
