import { describe, expect, it } from 'vitest';
import { shiftFormula, adjustFormula } from '../../src/core/formula/refs';
import { copyRange, fillRange, parseTSV, pasteClip, pasteText, serializeTSV } from '../../src/core/ops';
import { setup } from './helpers';

describe('referências relativas e absolutas', () => {
  it('desloca só as partes relativas', () => {
    expect(shiftFormula('A1+$B$2+C$3+$D4', 2, 1)).toBe('B3+$B$2+D$3+$D6');
    expect(shiftFormula('SUM(A1:A10)', 1, 0)).toBe('SUM(A2:A11)');
    expect(shiftFormula('A1', -5, 0)).toBe('#REF!');
  });

  it('inserir e excluir linhas ajusta fórmulas', () => {
    const op = { sheet: 'P', axis: 'row' as const, at: 2, count: 1 };
    expect(adjustFormula('SUM(A1:A5)+A2+A3', 'P', op)).toBe('SUM(A1:A6)+A2+A4');
    const del = { sheet: 'P', axis: 'row' as const, at: 2, count: -1 };
    expect(adjustFormula('SUM(A1:A5)+A3', 'P', del)).toBe('SUM(A1:A4)+#REF!');
  });
});

describe('copiar, recortar e colar', () => {
  it('copiar fórmula ajusta referências relativas', () => {
    const { wb, sh, put, val, rg, edit } = setup();
    put('A1', '2');
    put('A2', '3');
    put('B1', '=A1*10');
    const { clip } = copyRange(wb, sh, rg('B1'), false);
    pasteClip(wb, sh, rg('B2'), clip);
    expect(edit('B2')).toBe('=A2*10');
    expect(val('B2')).toBe(30);
  });

  it('colar num intervalo maior repete o bloco', () => {
    const { wb, sh, put, val, rg } = setup();
    put('A1', '1');
    put('B1', '=A1+1');
    const { clip } = copyRange(wb, sh, rg('B1'), false);
    pasteClip(wb, sh, rg('B2:B4'), clip);
    put('A4', '9');
    expect(val('B4')).toBe(10);
  });

  it('recortar move e atualiza quem apontava para o bloco', () => {
    const { wb, sh, put, val, rg, edit } = setup();
    put('A1', '5');
    put('C1', '=A1*2');
    const { clip } = copyRange(wb, sh, rg('A1'), true);
    pasteClip(wb, sh, rg('A5'), clip);
    expect(val('A1')).toBe(null);
    expect(val('A5')).toBe(5);
    expect(edit('C1')).toBe('=A5*2');
    expect(val('C1')).toBe(10);
  });

  it('colar texto de outro programa (tabulações e decimais pt-BR)', () => {
    const { wb, sh, val, rg } = setup();
    const out = pasteText(wb, sh, rg('A1'), 'Nome\tValor\r\nAna\t1.500,50\r\nBia\t"2,5"\r\n');
    expect(out).toEqual({ r1: 0, c1: 0, r2: 2, c2: 1 });
    expect(val('B2')).toBe(1500.5);
    expect(val('B3')).toBe(2.5);
  });

  it('TSV ida e volta com aspas e quebras', () => {
    const grid = [['a', 'b\tc'], ['linha\nnova', 'x"y']];
    expect(parseTSV(serializeTSV(grid))).toEqual(grid);
  });

  it('colar só valores', () => {
    const { wb, sh, put, val, rg, edit } = setup();
    put('A1', '4');
    put('B1', '=A1*2');
    const { clip } = copyRange(wb, sh, rg('B1'), false);
    pasteClip(wb, sh, rg('C1'), clip, 'values');
    expect(edit('C1')).toBe('8');
    expect(val('C1')).toBe(8);
  });
});

describe('desfazer e refazer', () => {
  it('desfaz e refaz edições', () => {
    const { wb, put, val } = setup();
    put('A1', '1');
    put('A1', '2');
    put('B1', '=A1*3');
    expect(val('B1')).toBe(6);
    wb.undo();
    expect(val('B1')).toBe(null);
    wb.undo();
    expect(val('A1')).toBe(1);
    wb.redo();
    expect(val('A1')).toBe(2);
    wb.redo();
    expect(val('B1')).toBe(6);
    expect(wb.canRedo()).toBe(false);
  });

  it('desfaz inserção de linha e exclusão de aba', () => {
    const { wb, sh, put, val, edit } = setup();
    put('A1', '1');
    put('A2', '2');
    put('A3', '=SOMA(A1:A2)');
    wb.insertRows(sh, 1, 1);
    expect(edit('A4')).toBe('=SOMA(A1:A3)');
    expect(val('A4')).toBe(3);
    wb.undo();
    expect(edit('A3')).toBe('=SOMA(A1:A2)');
    const s2 = wb.addSheet('Extra');
    wb.removeSheet(s2);
    expect(wb.sheets.length).toBe(1);
    wb.undo();
    expect(wb.sheets.length).toBe(2);
    expect(wb.sheets[1].name).toBe('Extra');
  });

  it('desfazer formatação', () => {
    const { wb, sh, put } = setup();
    put('A1', 'x');
    wb.applyStyle(sh, { r1: 0, c1: 0, r2: 0, c2: 0 }, { b: true });
    expect(sh.get(0, 0)?.s?.b).toBe(true);
    wb.undo();
    expect(sh.get(0, 0)?.s?.b).toBeUndefined();
  });

  it('renomear aba atualiza fórmulas', () => {
    const { wb, put, edit, val } = setup(['Dados', 'Resumo']);
    put('A1', '3');
    put('A1', '=Dados!A1+1', wb.sheets[1]);
    wb.renameSheet(wb.sheets[0], 'Vendas 2026');
    expect(edit('A1', wb.sheets[1])).toBe("='Vendas 2026'!A1+1");
    expect(val('A1', wb.sheets[1])).toBe(4);
  });
});

describe('preencher', () => {
  it('série numérica e fórmulas', () => {
    const { wb, sh, put, val, rg, edit } = setup();
    put('A1', '1');
    put('A2', '2');
    fillRange(wb, sh, rg('A1:A2'), rg('A1:A5'));
    expect(val('A5')).toBe(5);
    put('B1', '=A1*2');
    fillRange(wb, sh, rg('B1'), rg('B1:B5'));
    expect(edit('B5')).toBe('=A5*2');
    expect(val('B5')).toBe(10);
  });
});
