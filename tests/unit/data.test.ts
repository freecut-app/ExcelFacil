import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  detectRegion,
  distinctValues,
  enableFilter,
  findAll,
  removeDuplicates,
  replaceAll,
  selectionStats,
  setColumnFilter,
  sortRange,
} from '../../src/core/ops';
import { setup } from './helpers';

function table() {
  const t = setup();
  const rows = [
    ['Produto', 'Qtd', 'Total'],
    ['Caneta', '10', '=B2*2'],
    ['Lápis', '3', '=B3*2'],
    ['Borracha', '7', '=B4*2'],
    ['', '', ''],
  ];
  rows.forEach((r, i) => r.forEach((v, j) => v && t.put(String.fromCharCode(65 + j) + (i + 1), v)));
  return t;
}

describe('ordenação', () => {
  it('ordena crescente e decrescente mantendo fórmulas por linha', () => {
    const { wb, sh, val, edit, rg } = table();
    sortRange(wb, sh, rg('A1:C4'), 1, true, true);
    expect(val('A2')).toBe('Lápis');
    expect(val('C2')).toBe(6);
    expect(edit('C2')).toBe('=B2*2');
    sortRange(wb, sh, rg('A1:C4'), 0, false, true);
    expect(val('A2')).toBe('Lápis');
    expect(val('A4')).toBe('Borracha');
    wb.undo();
    expect(val('A2')).toBe('Lápis');
    expect(val('A4')).toBe('Caneta');
  });

  it('vazios ficam no fim', () => {
    const { wb, sh, put, val, rg } = setup();
    put('A1', '3');
    put('A3', '1');
    put('A4', '2');
    sortRange(wb, sh, rg('A1:A4'), 0, false, false);
    expect([val('A1'), val('A2'), val('A3'), val('A4')]).toEqual([3, 2, 1, null]);
  });
});

describe('filtros', () => {
  it('esconde linhas que não batem e mostra de novo', () => {
    const { wb, sh } = table();
    const region = detectRegion(sh, 1, 1);
    expect(region).toEqual({ r1: 0, c1: 0, r2: 3, c2: 2 });
    enableFilter(wb, sh, region);
    expect(distinctValues(wb, sh, 0)).toEqual(['Borracha', 'Caneta', 'Lápis']);
    setColumnFilter(wb, sh, 0, ['Caneta']);
    expect([...sh.hiddenRows].sort()).toEqual([2, 3]);
    // Estatísticas ignoram linhas escondidas
    expect(selectionStats(wb, sh, [{ r1: 1, c1: 1, r2: 3, c2: 1 }]).sum).toBe(10);
    setColumnFilter(wb, sh, 0, null);
    expect(sh.hiddenRows.size).toBe(0);
    wb.undo();
    expect(sh.hiddenRows.size).toBe(2);
    applyFilter(wb, sh);
    expect(sh.hiddenRows.size).toBe(2);
  });
});

describe('localizar e substituir', () => {
  it('encontra sem diferenciar maiúsculas e substitui valores', () => {
    const { wb, sh, val } = table();
    expect(findAll(wb, sh, 'caneta').length).toBe(1);
    const n = replaceAll(wb, sh, 'Caneta', 'Lapiseira');
    expect(n).toBe(1);
    expect(val('A2')).toBe('Lapiseira');
    const m = replaceAll(wb, sh, '10', '12');
    expect(m).toBe(1);
    expect(val('C2')).toBe(24);
  });
});

describe('remover duplicados', () => {
  it('remove linhas repetidas', () => {
    const { wb, sh, put, val, rg } = setup();
    [['Nome', 'Cidade'], ['Ana', 'SP'], ['Bia', 'RJ'], ['ana', 'SP'], ['Caio', 'SP']].forEach((r, i) =>
      r.forEach((v, j) => put(String.fromCharCode(65 + j) + (i + 1), v)),
    );
    const removed = removeDuplicates(wb, sh, rg('A1:B5'), [0, 1], true);
    expect(removed).toBe(1);
    expect(val('A4')).toBe('Caio');
    expect(val('A5')).toBe(null);
  });
});

describe('estatísticas da seleção', () => {
  it('soma, média, maior e menor', () => {
    const { wb, sh, put } = setup();
    put('A1', '2');
    put('A2', '8');
    put('A3', 'texto');
    const st = selectionStats(wb, sh, [{ r1: 0, c1: 0, r2: 5, c2: 0 }]);
    expect(st).toMatchObject({ sum: 10, count: 2, countA: 3, min: 2, max: 8, avg: 5 });
  });
});
