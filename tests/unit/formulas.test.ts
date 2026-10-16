import { describe, expect, it } from 'vitest';
import { fromDisplay, toDisplay } from '../../src/core/formula/locale';
import { InputError } from '../../src/core/workbook';
import { setup } from './helpers';

describe('tradução pt-BR <-> interno', () => {
  it('converte nomes, separadores e decimais', () => {
    expect(fromDisplay('SOMA(B2:B10)')).toBe('SUM(B2:B10)');
    expect(fromDisplay('SE(D2>100;"Alto";"Baixo")')).toBe('IF(D2>100,"Alto","Baixo")');
    expect(fromDisplay('MÉDIA(A1;2,5)')).toBe('AVERAGE(A1,2.5)');
    expect(fromDisplay('cont.núm(a1:a3)')).toBe('COUNT(A1:A3)');
    expect(fromDisplay('MEDIA(A1:A2)')).toBe('AVERAGE(A1:A2)'); // sem acento também vale
    expect(toDisplay('IF(A1>1.5,TRUE,FALSE)')).toBe('SE(A1>1,5;VERDADEIRO;FALSO)');
    expect(toDisplay('COUNTA(A:A)')).toBe('CONT.VALORES(A:A)');
  });

  it('preserva texto entre aspas e nomes de aba', () => {
    expect(fromDisplay('"a;b,c"&\'Minha aba\'!A1')).toBe('"a;b,c"&\'Minha aba\'!A1');
    expect(toDisplay('"x,y"')).toBe('"x,y"');
  });

  it('avisa quando usam vírgula como separador', () => {
    expect(() => fromDisplay('SOMA(A1,A2)')).toThrow(/ponto e vírgula/);
  });
});

describe('fórmulas', () => {
  it('aritmética e precedência', () => {
    const { put, val } = setup();
    put('A1', '=1+2*3');
    put('A2', '=(1+2)*3');
    put('A3', '=-2^2');
    put('A4', '=10/4');
    put('A5', '=50%*10');
    put('A6', '=2^3^2');
    expect(val('A1')).toBe(7);
    expect(val('A2')).toBe(9);
    expect(val('A3')).toBe(4); // igual ao Excel
    expect(val('A4')).toBe(2.5);
    expect(val('A5')).toBe(5);
    expect(val('A6')).toBe(64);
  });

  it('decimal com vírgula na fórmula', () => {
    const { put, val } = setup();
    put('A1', '=1,5+2,25');
    expect(val('A1')).toBe(3.75);
  });

  it('referências e recálculo de dependentes', () => {
    const { put, val } = setup();
    put('B2', '10');
    put('C2', '3');
    put('D2', '=B2*C2');
    put('E2', '=D2+1');
    expect(val('D2')).toBe(30);
    expect(val('E2')).toBe(31);
    put('B2', '20');
    expect(val('D2')).toBe(60);
    expect(val('E2')).toBe(61);
  });

  it('SOMA, MÉDIA, MÍNIMO, MÁXIMO, CONT.NÚM, CONT.VALORES', () => {
    const { put, val } = setup();
    ['5', '10', 'texto', '', '15'].forEach((v, i) => v && put('B' + (i + 2), v));
    put('C1', '=SOMA(B2:B10)');
    put('C2', '=MÉDIA(B2:B10)');
    put('C3', '=MÍNIMO(B2:B10)');
    put('C4', '=MÁXIMO(B2:B10)');
    put('C5', '=CONT.NÚM(B2:B10)');
    put('C6', '=CONT.VALORES(B2:B10)');
    put('C7', '=SOMA(B2;B3;100)');
    expect(val('C1')).toBe(30);
    expect(val('C2')).toBe(10);
    expect(val('C3')).toBe(5);
    expect(val('C4')).toBe(15);
    expect(val('C5')).toBe(3);
    expect(val('C6')).toBe(4);
    expect(val('C7')).toBe(115);
  });

  it('SE com texto', () => {
    const { put, val } = setup();
    put('D2', '150');
    put('E2', '=SE(D2>100;"Alto";"Baixo")');
    expect(val('E2')).toBe('Alto');
    put('D2', '50');
    expect(val('E2')).toBe('Baixo');
  });

  it('SE não avalia o ramo não usado', () => {
    const { put, val } = setup();
    put('A1', '0');
    put('B1', '=SE(A1=0;"zero";1/A1)');
    expect(val('B1')).toBe('zero');
  });

  it('referências absolutas e entre abas', () => {
    const { wb, put, val } = setup(['Dados', 'Resumo']);
    const resumo = wb.sheets[1];
    put('A1', '7');
    put('A1', '=Dados!$A$1*2', resumo);
    expect(val('A1', resumo)).toBe(14);
    put('A1', '8');
    expect(val('A1', resumo)).toBe(16);
  });

  it('erros compreensíveis', () => {
    const { put, val, shown } = setup();
    put('A1', '=1/0');
    put('A2', '="a"+1');
    put('A3', '=SOMAA(1)');
    put('A4', '=Inexistente!A1');
    expect(val('A1')).toEqual({ err: '#DIV/0!' });
    expect(val('A2')).toEqual({ err: '#VALUE!' });
    expect(shown('A2')).toBe('#VALOR!');
    expect(shown('A3')).toBe('#NOME?');
    expect(val('A4')).toEqual({ err: '#REF!' });
  });

  it('fórmula com erro de sintaxe é recusada com mensagem amigável', () => {
    const { put } = setup();
    expect(() => put('A1', '=SOMA(1;2')).toThrow(InputError);
    expect(() => put('A1', '=1+')).toThrow(InputError);
  });

  it('referência circular', () => {
    const { put, val, shown } = setup();
    put('A1', '=B1+1');
    put('B1', '=A1+1');
    expect(val('A1')).toEqual({ err: '#CIRC!' });
    expect(shown('B1')).toBe('#CIRCULAR!');
    put('B1', '5');
    expect(val('A1')).toBe(6);
  });

  it('cadeia longa não estoura a pilha', () => {
    const { wb, sh, val } = setup();
    wb.setInput(sh, 0, 0, '1');
    const items = [];
    for (let r = 1; r < 20000; r++) items.push({ row: r, col: 0, cell: { f: `A${r}+1` } });
    wb.setCells(sh, items);
    expect(val('A20000')).toBe(20000);
    wb.setInput(sh, 0, 0, '2');
    expect(val('A20000')).toBe(20001);
  });

  it('funções extras: SOMASE, CONT.SE, PROCV, ARRED, CONCATENAR, SEERRO', () => {
    const { put, val } = setup();
    put('A1', 'maçã');
    put('B1', '3');
    put('A2', 'pera');
    put('B2', '5');
    put('A3', 'maçã');
    put('B3', '2');
    put('C1', '=SOMASE(A1:A3;"maçã";B1:B3)');
    put('C2', '=CONT.SE(B1:B3;">2")');
    put('C3', '=PROCV("pera";A1:B3;2;FALSO)');
    put('C4', '=ARRED(2,345;2)');
    put('C5', '=CONCATENAR(A1;" e ";A2)');
    put('C6', '=SEERRO(1/0;"ops")');
    put('C7', '=PROCV("uva";A1:B3;2;FALSO)');
    expect(val('C1')).toBe(5);
    expect(val('C2')).toBe(2);
    expect(val('C3')).toBe(5);
    expect(val('C4')).toBe(2.35);
    expect(val('C5')).toBe('maçã e pera');
    expect(val('C6')).toBe('ops');
    expect(val('C7')).toEqual({ err: '#N/A' });
  });

  it('a barra de fórmulas mostra a fórmula em português', () => {
    const { put, edit } = setup();
    put('A1', '=soma(b1:b3;0,5)');
    expect(edit('A1')).toBe('=SOMA(B1:B3;0,5)');
  });
});

describe('entrada no padrão brasileiro', () => {
  it('números, moeda, porcentagem e datas', () => {
    const { put, val, shown, sh } = setup();
    put('A1', '1.234,56');
    put('A2', '12,5');
    put('A3', 'R$ 10,90');
    put('A4', '15%');
    put('A5', '16/10/2026');
    put('A6', '1234.5');
    put('A7', '007abc');
    expect(val('A1')).toBe(1234.56);
    expect(val('A2')).toBe(12.5);
    expect(val('A3')).toBe(10.9);
    expect(sh.get(2, 0)?.s?.fmt).toBe('currency');
    expect(shown('A3')).toBe('R$ 10,90');
    expect(val('A4')).toBe(0.15);
    expect(shown('A4')).toBe('15%');
    expect(shown('A5')).toBe('16/10/2026');
    expect(val('A6')).toBe(1234.5);
    expect(val('A7')).toBe('007abc');
  });

  it('formatação de números', () => {
    const { put, shown, wb, sh } = setup();
    put('A1', '1234567,891');
    expect(shown('A1')).toBe('1234567,891');
    wb.applyStyle(sh, { r1: 0, c1: 0, r2: 0, c2: 0 }, { fmt: 'currency', dec: 2 });
    expect(shown('A1')).toBe('R$ 1.234.567,89');
    wb.applyStyle(sh, { r1: 0, c1: 0, r2: 0, c2: 0 }, { fmt: 'number', dec: 0 });
    expect(shown('A1')).toBe('1.234.568');
    put('A2', '=0,1+0,2');
    expect(shown('A2')).toBe('0,3');
  });
});
