import { describe, expect, it } from 'vitest';
import { Cell } from '../../src/core/model';
import { readXlsx, writeXlsx } from '../../src/core/io/xlsx';
import { sortRange } from '../../src/core/ops';
import { prepareForSave } from '../../src/core/persist';
import { Workbook } from '../../src/core/workbook';

const N = 10_000;

function bigWorkbook() {
  const wb = new Workbook(['Dados']);
  const sh = wb.sheets[0];
  const items: { row: number; col: number; cell: Cell }[] = [];
  items.push({ row: 0, col: 0, cell: { v: 'Produto' } }, { row: 0, col: 1, cell: { v: 'Qtd' } }, { row: 0, col: 2, cell: { v: 'Preço' } });
  items.push({ row: 0, col: 3, cell: { v: 'Total' } }, { row: 0, col: 4, cell: { v: '% do total' } });
  for (let r = 1; r <= N; r++) {
    items.push({ row: r, col: 0, cell: { v: 'Item ' + r } });
    items.push({ row: r, col: 1, cell: { v: (r % 17) + 1 } });
    items.push({ row: r, col: 2, cell: { v: (r % 101) + 0.5, s: { fmt: 'currency', dec: 2 } } });
    items.push({ row: r, col: 3, cell: { f: `B${r + 1}*C${r + 1}` } });
    items.push({ row: r, col: 4, cell: { f: `D${r + 1}/$D$${N + 3}`, s: { fmt: 'percent', dec: 2 } } });
  }
  items.push({ row: N + 2, col: 3, cell: { f: `SUM(D2:D${N + 1})` } });
  wb.setCells(sh, items);
  return { wb, sh };
}

describe(`desempenho com ${N.toLocaleString('pt-BR')} linhas`, () => {
  it('carrega, calcula e recalcula rápido', () => {
    let t = performance.now();
    const { wb, sh } = bigWorkbook();
    const total = wb.value(sh, N + 2, 3) as number;
    const tFirst = performance.now() - t;
    expect(total).toBeGreaterThan(0);
    // Todas as porcentagens somam 100%
    let acc = 0;
    for (let r = 1; r <= N; r++) acc += wb.value(sh, r, 4) as number;
    expect(acc).toBeCloseTo(1, 6);

    t = performance.now();
    wb.setInput(sh, 5, 1, '1000');
    const total2 = wb.value(sh, N + 2, 3) as number;
    void wb.value(sh, 100, 4);
    const tRecalc = performance.now() - t;
    expect(total2).not.toBe(total);
    console.log(`  primeira carga+cálculo: ${tFirst.toFixed(0)} ms, recálculo após 1 edição: ${tRecalc.toFixed(1)} ms`);
    expect(tFirst).toBeLessThan(3000);
    expect(tRecalc).toBeLessThan(500);
  });

  it('ordena e salva/abre .xlsx', async () => {
    const { wb, sh } = bigWorkbook();
    let t = performance.now();
    sortRange(wb, sh, { r1: 0, c1: 0, r2: N, c2: 4 }, 3, false, true);
    const tSort = performance.now() - t;
    expect((wb.value(sh, 1, 3) as number) >= (wb.value(sh, 2, 3) as number)).toBe(true);

    t = performance.now();
    const bytes = await writeXlsx(prepareForSave(wb, 0));
    const tWrite = performance.now() - t;
    t = performance.now();
    const { workbook } = await readXlsx(bytes);
    const back = Workbook.fromJSON(workbook);
    const tRead = performance.now() - t;
    expect(back.value(back.sheets[0], N + 2, 3)).toBeCloseTo(wb.value(sh, N + 2, 3) as number, 6);
    console.log(
      `  ordenar: ${tSort.toFixed(0)} ms, gravar xlsx: ${tWrite.toFixed(0)} ms (${(bytes.length / 1024).toFixed(0)} KB), ler xlsx: ${tRead.toFixed(0)} ms`,
    );
  });
});
