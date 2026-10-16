import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { csvToSheet, sheetToCSV } from '../../src/core/io/csv';
import { classifyNumFmt, readXlsx, writeXlsx } from '../../src/core/io/xlsx';
import { prepareForSave } from '../../src/core/persist';
import { Workbook } from '../../src/core/workbook';
import { setup } from './helpers';

describe('CSV', () => {
  it('exporta com ponto e vírgula, BOM e vírgula decimal', () => {
    const { wb, sh, put } = setup();
    put('A1', 'Nome');
    put('B1', 'Valor');
    put('A2', 'Ana; Silva');
    put('B2', '1234,5');
    put('C2', '=B2*2');
    const csv = sheetToCSV(wb, sh);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Ana; Silva";1234,5;2469');
  });

  it('importa CSV brasileiro e CSV americano', () => {
    const br = csvToSheet('Nome;Valor\r\nAna;1.234,50\r\n"Bia ""B""";2,5\r\n', 'x');
    expect(br.delimiter).toBe(';');
    const wb = Workbook.fromJSON({ format: 'excel-facil', version: 1, activeSheet: 0, sheets: [br.sheet] });
    const s = wb.sheets[0];
    expect(wb.value(s, 1, 1)).toBe(1234.5);
    expect(wb.value(s, 2, 0)).toBe('Bia "B"');
    expect(s.get(0, 0)?.s?.b).toBe(true);

    const us = csvToSheet('name,price\nPen,1.50\nInk,=1+1\n', 'y');
    expect(us.delimiter).toBe(',');
    const wb2 = Workbook.fromJSON({ format: 'excel-facil', version: 1, activeSheet: 0, sheets: [us.sheet] });
    expect(wb2.value(wb2.sheets[0], 1, 1)).toBe(1.5);
    expect(wb2.value(wb2.sheets[0], 2, 1)).toBe('=1+1'); // fórmula de CSV entra como texto
  });
});

describe('XLSX', () => {
  it('ida e volta preserva valores, fórmulas, formatos e estrutura', async () => {
    const { wb, sh, put } = setup(['Gastos', 'Resumo']);
    put('A1', 'Item');
    put('B1', 'Valor');
    put('A2', 'Luz');
    put('B2', 'R$ 150,75');
    put('A3', 'Água');
    put('B3', '80');
    put('B4', '=SOMA(B2:B3)');
    put('C2', '16/10/2026');
    put('D2', '12,5%');
    wb.applyStyle(sh, { r1: 0, c1: 0, r2: 0, c2: 1 }, { b: true, fill: '#10b981', color: '#ffffff', align: 'center', bb: true });
    wb.setColWidth(sh, [0], 180);
    wb.setFreezeRows(sh, 1);
    put('A1', '=Gastos!B4*2', wb.sheets[1]);

    const bytes = await writeXlsx(prepareForSave(wb, 0));
    const { workbook, report } = await readXlsx(bytes);
    expect(report.unsupported).toBe(false);
    const back = Workbook.fromJSON(workbook);
    const g = back.sheets[0];
    expect(back.sheets.map((s) => s.name)).toEqual(['Gastos', 'Resumo']);
    expect(back.value(g, 1, 1)).toBe(150.75);
    expect(g.get(1, 1)?.s?.fmt).toBe('currency');
    expect(back.editText(g, 3, 1)).toBe('=SOMA(B2:B3)');
    expect(back.value(g, 3, 1)).toBe(230.75);
    expect(back.value(back.sheets[1], 0, 0)).toBe(461.5);
    expect(g.get(1, 2)?.s?.fmt).toBe('date');
    expect(back.value(g, 1, 2)).toBe(46311);
    expect(g.get(1, 3)?.s?.fmt).toBe('percent');
    expect(g.get(0, 0)?.s).toMatchObject({ b: true, fill: '#10b981', color: '#ffffff', align: 'center', bb: true });
    expect(g.colWidth(0)).toBe(180);
    expect(g.freezeRows).toBe(1);
  });

  it('lê um arquivo criado por outro programa e avisa sobre mesclagem', async () => {
    const x = new ExcelJS.Workbook();
    const ws = x.addWorksheet('Vendas');
    ws.getCell('A1').value = 'Título';
    ws.mergeCells('A1:C1');
    ws.getCell('A2').value = 10;
    ws.getCell('A3').value = { formula: 'A2*2', result: 20 } as ExcelJS.CellFormulaValue;
    ws.getCell('A4').value = { formula: 'XLOOKUP(1,A2:A3,A2:A3)', result: 99 } as ExcelJS.CellFormulaValue;
    ws.getCell('A5').value = new Date(Date.UTC(2026, 0, 31));
    ws.getCell('A5').numFmt = 'dd/mm/yyyy';
    const buf = new Uint8Array((await x.xlsx.writeBuffer()) as ArrayBuffer);
    const { workbook, report } = await readXlsx(buf);
    expect(report.warnings.some((w) => w.includes('mescladas'))).toBe(true);
    expect(report.unsupported).toBe(true);
    const wb = Workbook.fromJSON(workbook);
    const s = wb.sheets[0];
    expect(wb.value(s, 0, 0)).toBe('Título');
    expect(wb.value(s, 0, 1)).toBe(null);
    expect(wb.value(s, 2, 0)).toBe(20);
    expect(wb.value(s, 3, 0)).toBe(99); // função não suportada: mantém o último resultado
    expect(s.get(4, 0)?.s?.fmt).toBe('date');
  });

  it('recusa arquivo que não é xlsx', async () => {
    await expect(readXlsx(new TextEncoder().encode('não sou um xlsx'))).rejects.toThrow(/Não foi possível ler/);
  });

  it('classifica formatos numéricos do Excel', () => {
    expect(classifyNumFmt('"R$" #,##0.00')).toEqual({ fmt: 'currency', dec: 2 });
    expect(classifyNumFmt('[$R$-416] #,##0.00')).toEqual({ fmt: 'currency', dec: 2 });
    expect(classifyNumFmt('0.0%')).toEqual({ fmt: 'percent', dec: 1 });
    expect(classifyNumFmt('dd/mm/yyyy')).toEqual({ fmt: 'date' });
    expect(classifyNumFmt('#,##0')).toEqual({ fmt: 'number', dec: 0 });
  });
});
