// Preparação dos dados para salvar.

import { keyCol, keyRow } from './address';
import { Cell, isError, sheetToJSON, WorkbookJSON } from './model';
import { Workbook } from './workbook';

/**
 * JSON da pasta com o último valor calculado de cada fórmula em `v`
 * (o .xlsx guarda esse valor para que outros programas mostrem o resultado de imediato).
 */
export function prepareForSave(wb: Workbook, activeSheet: number): WorkbookJSON {
  const j = wb.toJSON(activeSheet);
  j.sheets = wb.sheets.map((s) => {
    const sj = sheetToJSON(s);
    sj.cells = [];
    for (const [k, c] of s.cells) {
      let out: Cell = c;
      if (c.f != null) {
        const v = wb.value(s, keyRow(k), keyCol(k));
        out = { ...c };
        if (v === null || isError(v)) delete out.v;
        else out.v = v;
      }
      sj.cells.push([keyRow(k), keyCol(k), out]);
    }
    return sj;
  });
  return j;
}

export interface RecoveryData {
  format: 'excel-facil-recovery';
  version: 1;
  docId: string;
  title: string;
  filePath: string | null;
  savedAt: string; // ISO
  workbook: WorkbookJSON;
}
