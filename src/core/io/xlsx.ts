// Leitura e gravação de .xlsx com ExcelJS (roda no processo principal, em worker).
// Macros NUNCA são executadas nem preservadas.

import ExcelJS from 'exceljs';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, Cell, CellStyle, NumFmt, SheetJSON, WorkbookJSON, Scalar } from '../model';

export interface ImportReport {
  warnings: string[];
  unsupported: boolean; // true = o arquivo tem recursos que se perderiam ao salvar por cima
  cells: number;
}

export const MAX_IMPORT_CELLS = 3_000_000;

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function dateToSerial(d: Date): number {
  return (d.getTime() - EXCEL_EPOCH) / 86_400_000;
}

// Paleta do tema padrão do Office (para cores definidas pelo tema).
const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

function applyTint(hex: string, tint: number): string {
  const n = parseInt(hex, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = (c: number) => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint);
  r = f(r);
  g = f(g);
  b = f(b);
  return ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function colorFrom(c: Partial<ExcelJS.Color> | undefined): string | undefined {
  if (!c) return undefined;
  const anyc = c as { argb?: string; theme?: number; tint?: number };
  if (anyc.argb && /^[0-9A-Fa-f]{8}$/.test(anyc.argb)) {
    return '#' + anyc.argb.slice(2).toLowerCase();
  }
  if (anyc.argb && /^[0-9A-Fa-f]{6}$/.test(anyc.argb)) return '#' + anyc.argb.toLowerCase();
  if (typeof anyc.theme === 'number' && THEME[anyc.theme]) {
    return '#' + applyTint(THEME[anyc.theme], anyc.tint ?? 0).toLowerCase();
  }
  return undefined;
}

function toArgb(hex: string): string {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

/** Classifica um formato numérico do Excel num dos formatos simples do aplicativo. */
export function classifyNumFmt(fmt: string | undefined): { fmt: NumFmt; dec?: number } {
  if (!fmt || fmt === 'General') return { fmt: 'general' };
  if (fmt === '@') return { fmt: 'text' };
  const clean = fmt.replace(/"[^"]*"/g, (m) => (m.includes('R$') ? 'R$' : '')).replace(/\[[^\]]*\]/g, (m) => (m.includes('R$') ? 'R$' : ''));
  const firstSection = clean.split(';')[0];
  const decMatch = /0[.,](0+)/.exec(firstSection);
  const dec = decMatch ? decMatch[1].length : 0;
  if (firstSection.includes('R$') || firstSection.includes('$') || firstSection.includes('€')) return { fmt: 'currency', dec };
  if (firstSection.includes('%')) return { fmt: 'percent', dec };
  if (/[dmyhs]/i.test(firstSection.replace(/\\./g, '')) && !/[0#]/.test(firstSection)) return { fmt: 'date' };
  if (/[0#]/.test(firstSection)) return { fmt: 'number', dec };
  return { fmt: 'general' };
}

function excelFmtFor(s: CellStyle): string | undefined {
  if (s.excelFmt) {
    const c = classifyNumFmt(s.excelFmt);
    if (c.fmt === (s.fmt ?? 'general') && (c.dec === s.dec || (s.dec === undefined && c.fmt !== 'percent' && c.fmt !== 'currency' && c.fmt !== 'number'))) {
      return s.excelFmt;
    }
  }
  const zeros = (n: number) => (n > 0 ? '.' + '0'.repeat(n) : '');
  switch (s.fmt) {
    case 'currency':
      return `"R$" #,##0${zeros(s.dec ?? 2)};-"R$" #,##0${zeros(s.dec ?? 2)}`;
    case 'percent':
      return `0${zeros(s.dec ?? 0)}%`;
    case 'number':
      return `#,##0${zeros(s.dec ?? 2)}`;
    case 'date':
      return 'dd/mm/yyyy';
    case 'text':
      return '@';
    default:
      return s.dec !== undefined ? `0${zeros(s.dec)}` : undefined;
  }
}

function styleFromExcel(cell: ExcelJS.Cell): CellStyle | undefined {
  const s: CellStyle = {};
  const f = cell.font;
  if (f) {
    if (f.name && f.name !== 'Calibri') s.font = f.name;
    if (f.size && f.size !== 11) s.size = f.size;
    if (f.bold) s.b = true;
    if (f.italic) s.i = true;
    if (f.underline) s.u = true;
    const col = colorFrom(f.color);
    if (col && col !== '#000000') s.color = col;
  }
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const col = colorFrom(fill.fgColor);
    if (col) s.fill = col;
  }
  const a = cell.alignment;
  if (a) {
    if (a.horizontal === 'left' || a.horizontal === 'center' || a.horizontal === 'right') s.align = a.horizontal;
    if (a.vertical === 'top' || a.vertical === 'middle' || a.vertical === 'bottom') s.valign = a.vertical === 'bottom' ? undefined : a.vertical;
    if (a.wrapText) s.wrap = true;
  }
  const b = cell.border;
  if (b) {
    if (b.top?.style) s.bt = true;
    if (b.bottom?.style) s.bb = true;
    if (b.left?.style) s.bl = true;
    if (b.right?.style) s.br = true;
  }
  if (cell.numFmt) {
    const c = classifyNumFmt(cell.numFmt);
    if (c.fmt !== 'general') {
      s.fmt = c.fmt;
      if (c.dec !== undefined && c.fmt !== 'date' && c.fmt !== 'text') s.dec = c.dec;
      s.excelFmt = cell.numFmt;
    }
  }
  for (const k of Object.keys(s) as (keyof CellStyle)[]) if (s[k] === undefined) delete s[k];
  return Object.keys(s).length ? s : undefined;
}

function scalarFrom(v: unknown): Scalar {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return dateToSerial(v);
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: unknown; error?: string; result?: unknown };
    if (o.richText) return o.richText.map((x) => x.text).join('');
    if (o.error) return null;
    if ('text' in o && typeof o.text === 'string') return o.text;
    if ('text' in o && o.text && typeof o.text === 'object') return scalarFrom(o.text);
  }
  return null;
}

/** Procura nomes de partes do pacote .xlsx (o diretório do zip guarda nomes sem compressão). */
function zipHas(buf: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= buf.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (buf[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

export async function readXlsx(data: Uint8Array): Promise<{ workbook: WorkbookJSON; report: ImportReport }> {
  const warnings: string[] = [];
  let unsupported = false;
  const flag = (cond: boolean, msg: string) => {
    if (cond) {
      warnings.push(msg);
      unsupported = true;
    }
  };
  flag(zipHas(data, 'vbaProject.bin'), 'O arquivo contém macros (VBA). Elas NÃO serão executadas e serão removidas se você salvar.');
  flag(zipHas(data, 'xl/charts/'), 'O arquivo contém gráficos. Eles não aparecem aqui e se perderiam ao salvar.');
  flag(zipHas(data, 'xl/pivotTables/') || zipHas(data, 'xl/pivotCache/'), 'O arquivo contém tabelas dinâmicas. Só os valores aparecem; a tabela dinâmica se perderia ao salvar.');
  flag(zipHas(data, 'xl/externalLinks/'), 'O arquivo tem vínculos com outros arquivos. Os últimos valores salvos foram mantidos, mas não serão atualizados.');
  flag(zipHas(data, 'xl/connections.xml'), 'O arquivo tem conexões com bancos de dados ou internet. Elas não serão usadas.');
  flag(zipHas(data, 'xl/media/') || zipHas(data, 'xl/drawings/'), 'O arquivo contém imagens ou desenhos, que não são exibidos e se perderiam ao salvar.');
  flag(zipHas(data, 'xl/comments') || zipHas(data, 'xl/threadedComments/'), 'O arquivo contém comentários, que não são exibidos.');

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch (e) {
    throw new Error('Não foi possível ler este arquivo. Ele pode estar corrompido, protegido por senha ou não ser um .xlsx.');
  }

  let totalCells = 0;
  let merges = 0;
  let condFormats = 0;
  let validations = 0;
  const sheets: SheetJSON[] = [];
  let activeSheet = 0;

  wb.eachSheet((ws) => {
    if (ws.state === 'veryHidden') return;
    const cells: [number, number, Cell][] = [];
    const colWidths: [number, number][] = [];
    const rowHeights: [number, number][] = [];
    const hiddenRows: number[] = [];
    const wsModel = ws.model as unknown as { merges?: string[]; conditionalFormattings?: unknown[] };
    merges += wsModel.merges?.length ?? 0;
    condFormats += wsModel.conditionalFormattings?.length ?? 0;

    ws.columns?.forEach((col, i) => {
      if (col && col.width && Math.abs(col.width - 9.140625) > 0.01 && col.width !== 8.43) {
        const px = Math.round(col.width * 7 + 5);
        if (px !== DEFAULT_COL_WIDTH) colWidths.push([i, px]);
      }
    });

    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const r = rn - 1;
      if (row.height) {
        const px = Math.round((row.height * 96) / 72);
        if (Math.abs(px - DEFAULT_ROW_HEIGHT) > 1) rowHeights.push([r, px]);
      }
      if (row.hidden) hiddenRows.push(r);
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        const c = cn - 1;
        if (cell.isMerged && cell.master !== cell) {
          const s = styleFromExcel(cell);
          if (s) cells.push([r, c, { s }]);
          return;
        }
        if ((cell as unknown as { dataValidation?: unknown }).dataValidation) validations++;
        const out: Cell = {};
        const v = cell.value as unknown;
        if (v && typeof v === 'object' && ('formula' in (v as object) || 'sharedFormula' in (v as object))) {
          let f = cell.formula;
          if (f) {
            f = f.replace(/^=/, '').replace(/_xlfn\./gi, '');
            out.f = f;
            const res = scalarFrom((v as { result?: unknown }).result);
            if (res !== null) out.v = res;
          } else {
            out.v = scalarFrom((v as { result?: unknown }).result);
          }
        } else {
          const sv = scalarFrom(v);
          if (sv !== null) out.v = sv;
        }
        const s = styleFromExcel(cell);
        if (s) out.s = s;
        if (out.v === undefined && out.f === undefined && !out.s) return;
        totalCells++;
        if (totalCells > MAX_IMPORT_CELLS) {
          throw new Error(`Este arquivo é grande demais (mais de ${MAX_IMPORT_CELLS.toLocaleString('pt-BR')} células preenchidas).`);
        }
        cells.push([r, c, out]);
      });
    });

    let freezeRows = 0;
    const view = ws.views?.[0] as { state?: string; ySplit?: number; tabSelected?: boolean } | undefined;
    if (view?.state === 'frozen' && view.ySplit) freezeRows = view.ySplit;
    if (view?.tabSelected) activeSheet = sheets.length;

    let filter: SheetJSON['filter'] = null;
    const af = ws.autoFilter as unknown;
    if (af) {
      let ref = '';
      if (typeof af === 'string') ref = af;
      else if (typeof af === 'object' && af && 'from' in af) {
        const o = af as { from: string | { row: number; column: number }; to: string | { row: number; column: number } };
        const a = typeof o.from === 'string' ? o.from : null;
        if (a) ref = a + ':' + (o.to as string);
        else {
          const f = o.from as { row: number; column: number };
          const t = o.to as { row: number; column: number };
          filter = { headerRow: f.row - 1, c1: f.column - 1, c2: t.column - 1, allowed: {} };
        }
      }
      const m = /^([A-Z]+)(\d+):([A-Z]+)\d+$/.exec(ref.replace(/\$/g, ''));
      if (m) {
        const col = (L: string) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        filter = { headerRow: +m[2] - 1, c1: col(m[1]), c2: col(m[3]), allowed: {} };
      }
    }

    if (ws.state === 'hidden') warnings.push(`A aba "${ws.name}" estava oculta no arquivo e agora aparece normalmente.`);

    sheets.push({ name: ws.name.slice(0, 31), cells, colWidths, rowHeights, hiddenRows, freezeRows, filter });
  });

  if (!sheets.length) throw new Error('O arquivo não tem nenhuma aba com dados.');

  if (merges) warnings.push(`O arquivo tem ${merges} grupo(s) de células mescladas. Aqui elas aparecem separadas; o texto fica na primeira célula.`);
  if (condFormats) warnings.push('O arquivo usa formatação condicional, que não é exibida e se perderia ao salvar.');
  if (validations) warnings.push('O arquivo usa validação de dados (listas suspensas), que não é aplicada aqui.');
  if (merges || condFormats || validations) unsupported = true;

  return {
    workbook: { format: 'excel-facil', version: 1, activeSheet, sheets },
    report: { warnings, unsupported, cells: totalCells },
  };
}

/** Grava um .xlsx. As células com fórmula devem trazer em `v` o último valor calculado. */
export async function writeXlsx(j: WorkbookJSON): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Excel Fácil';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  j.sheets.forEach((sj, idx) => {
    const ws = wb.addWorksheet(sj.name, {
      // tabSelected existe no formato, mas falta na tipagem do ExcelJS.
      views: [
        sj.freezeRows > 0
          ? { state: 'frozen', ySplit: sj.freezeRows, xSplit: 0, topLeftCell: `A${sj.freezeRows + 1}`, activeCell: 'A1', tabSelected: idx === j.activeSheet }
          : { state: 'normal', tabSelected: idx === j.activeSheet },
      ] as unknown as Partial<ExcelJS.WorksheetView>[],
    });
    for (const [c, w] of sj.colWidths) ws.getColumn(c + 1).width = Math.max(1, (w - 5) / 7);
    for (const [r, h] of sj.rowHeights) ws.getRow(r + 1).height = (h * 72) / 96;
    for (const r of sj.hiddenRows) ws.getRow(r + 1).hidden = true;

    for (const [r, c, cell] of sj.cells) {
      const xc = ws.getCell(r + 1, c + 1);
      if (cell.f != null) {
        const result = cell.v === null || cell.v === undefined ? undefined : cell.v;
        xc.value = { formula: cell.f, result: result as number | string | boolean | undefined } as ExcelJS.CellFormulaValue;
      } else if (cell.v !== undefined && cell.v !== null) {
        xc.value = cell.v;
      }
      const s = cell.s;
      if (!s) continue;
      const font: Partial<ExcelJS.Font> = {};
      if (s.font) font.name = s.font;
      if (s.size) font.size = s.size;
      if (s.b) font.bold = true;
      if (s.i) font.italic = true;
      if (s.u) font.underline = true;
      if (s.color) font.color = { argb: toArgb(s.color) };
      if (Object.keys(font).length) xc.font = { name: 'Calibri', size: 11, ...font };
      if (s.fill) xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(s.fill) } };
      if (s.align || s.valign || s.wrap) {
        xc.alignment = {
          ...(s.align ? { horizontal: s.align } : {}),
          ...(s.valign ? { vertical: s.valign } : {}),
          ...(s.wrap ? { wrapText: true } : {}),
        };
      }
      if (s.bt || s.bb || s.bl || s.br) {
        const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF7F7F7F' } };
        xc.border = {
          ...(s.bt ? { top: thin } : {}),
          ...(s.bb ? { bottom: thin } : {}),
          ...(s.bl ? { left: thin } : {}),
          ...(s.br ? { right: thin } : {}),
        };
      }
      const nf = excelFmtFor(s);
      if (nf) xc.numFmt = nf;
    }

    if (sj.filter) {
      let lastRow = sj.filter.headerRow;
      for (const [r] of sj.cells) if (r > lastRow) lastRow = r;
      ws.autoFilter = {
        from: { row: sj.filter.headerRow + 1, column: sj.filter.c1 + 1 },
        to: { row: lastRow + 1, column: sj.filter.c2 + 1 },
      };
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
