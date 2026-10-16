import { describe, expect, it } from 'vitest';
import { keyCol, keyRow } from '../../src/core/address';
import { buildPrintHtml } from '../../src/core/io/print';
import { isError } from '../../src/core/model';
import { createFromTemplate, TEMPLATES } from '../../src/core/templates';
import { Workbook } from '../../src/core/workbook';
import { setup } from './helpers';

describe('modelos prontos', () => {
  for (const t of TEMPLATES) {
    it(`"${t.title}" abre sem erros de fórmula`, () => {
      const wb = createFromTemplate(t.id);
      let formulas = 0;
      for (const s of wb.sheets)
        for (const [k, c] of s.cells) {
          if (c.f == null) continue;
          formulas++;
          const v = wb.value(s, keyRow(k), keyCol(k));
          expect(isError(v), `${s.name} ${k}: ${c.f} -> ${JSON.stringify(v)}`).toBe(false);
        }
      if (t.id !== 'blank') expect(formulas).toBeGreaterThan(0);
      expect(wb.canUndo()).toBe(false); // modelo novo não começa com histórico
    });
  }

  it('controle de gastos soma por categoria', () => {
    const wb = createFromTemplate('gastos');
    const s = wb.sheets[0];
    expect(wb.value(s, 2, 7)).toBeCloseTo(357.25); // Alimentação
    expect(wb.value(s, 17, 3)).toBeCloseTo(602.15); // Total
    wb.setInput(s, 7, 2, 'Lazer');
    wb.setInput(s, 7, 3, '100');
    expect(wb.value(s, 6, 7)).toBe(100);
  });

  it('estoque avisa quando repor', () => {
    const wb = createFromTemplate('estoque');
    const s = wb.sheets[0];
    expect(wb.value(s, 3, 5)).toBe('Repor'); // Feijão: 4 <= 6
    expect(wb.value(s, 2, 5)).toBe('OK');
    expect(wb.value(s, 27, 5)).toBe('2 para repor');
  });
});

describe('recuperação (JSON)', () => {
  it('ida e volta preserva tudo, inclusive filtro e linhas ocultas', () => {
    const { wb, sh, put } = setup(['A', 'B']);
    put('A1', 'Nome');
    put('A2', 'x');
    put('B1', '=SOMA(1;2)');
    wb.applyStyle(sh, { r1: 0, c1: 0, r2: 0, c2: 0 }, { b: true, fill: '#ff0000' });
    wb.setColWidth(sh, [0], 150);
    sh.filter = { headerRow: 0, c1: 0, c2: 1, allowed: { 0: ['x'] } };
    sh.hiddenRows.add(5);
    const j = JSON.parse(JSON.stringify(wb.toJSON(1)));
    const back = Workbook.fromJSON(j);
    const s = back.sheets[0];
    expect(j.activeSheet).toBe(1);
    expect(back.value(s, 0, 1)).toBe(3);
    expect(s.get(0, 0)?.s).toEqual({ b: true, fill: '#ff0000' });
    expect(s.colWidth(0)).toBe(150);
    expect(s.filter?.allowed[0]).toEqual(['x']);
    expect(s.hiddenRows.has(5)).toBe(true);
  });

  it('recusa dados inválidos', () => {
    expect(() => Workbook.fromJSON({} as never)).toThrow();
  });
});

describe('impressão', () => {
  it('escapa HTML e não inclui scripts', () => {
    const { wb, sh, put } = setup();
    put('A1', '<script>alert(1)</script>');
    put('B1', '10');
    const html = buildPrintHtml(wb, sh, { orientation: 'portrait', gridlines: true, fitWidth: true, title: 'T<b>', showTitle: true });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('T&lt;b&gt;');
  });

  it('texto longo ocupa as células vazias ao lado', () => {
    const { wb, sh, put } = setup();
    put('A1', 'Título bem comprido da planilha');
    put('A2', '1');
    put('C2', '2');
    const html = buildPrintHtml(wb, sh, { orientation: 'portrait', gridlines: true, fitWidth: true, title: 'x', showTitle: false });
    expect(html).toContain('colspan="3"');
  });
});

describe('nomes de aba', () => {
  it('valida nomes', () => {
    expect(Workbook.validateSheetName('')).toMatch(/vazio/);
    expect(Workbook.validateSheetName('a/b')).toMatch(/caracteres/);
    expect(Workbook.validateSheetName('x'.repeat(32))).toMatch(/31/);
    expect(Workbook.validateSheetName('Vendas 2026')).toBeNull();
  });
});
