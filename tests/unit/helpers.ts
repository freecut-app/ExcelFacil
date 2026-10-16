import { parseA1, parseRangeA1, Range } from '../../src/core/address';
import { formatValue } from '../../src/core/format';
import { Sheet, Value } from '../../src/core/model';
import { Workbook } from '../../src/core/workbook';

export function setup(names = ['Planilha1']) {
  const wb = new Workbook(names);
  const sh = wb.sheets[0];
  const put = (a1: string, text: string, sheet: Sheet = sh) => {
    const p = parseA1(a1)!;
    wb.setInput(sheet, p.row, p.col, text);
  };
  const val = (a1: string, sheet: Sheet = sh): Value => {
    const p = parseA1(a1)!;
    return wb.value(sheet, p.row, p.col);
  };
  const shown = (a1: string, sheet: Sheet = sh): string => {
    const p = parseA1(a1)!;
    return formatValue(wb.value(sheet, p.row, p.col), sheet.get(p.row, p.col)?.s);
  };
  const edit = (a1: string, sheet: Sheet = sh) => {
    const p = parseA1(a1)!;
    return wb.editText(sheet, p.row, p.col);
  };
  const rg = (s: string): Range => parseRangeA1(s)!;
  return { wb, sh, put, val, shown, edit, rg };
}
