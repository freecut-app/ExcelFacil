// Gera um documento HTML estático (sem scripts) para imprimir ou exportar PDF.

import { Range } from '../address';
import { formatValue } from '../format';
import { DEFAULT_FONT, DEFAULT_SIZE, isError, Sheet } from '../model';
import { Workbook } from '../workbook';

export interface PrintOptions {
  orientation: 'portrait' | 'landscape';
  gridlines: boolean;
  fitWidth: boolean;
  title: string;
  showTitle: boolean;
  range?: Range; // padrão: área usada
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function safeColor(c: string | undefined): string | null {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
}

function safeFont(f: string | undefined): string {
  return (f ?? DEFAULT_FONT).replace(/[^A-Za-z0-9 \-]/g, '');
}

export function printArea(sheet: Sheet): Range | null {
  const u = sheet.usedData();
  if (!u.rows || !u.cols) return null;
  return { r1: 0, c1: 0, r2: u.rows - 1, c2: u.cols - 1 };
}

export function buildPrintHtml(wb: Workbook, sheet: Sheet, opts: PrintOptions): string {
  const area = opts.range ?? printArea(sheet);
  const css = `
    @page { size: A4 ${opts.orientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { font-family: '${safeFont(undefined)}', Arial, sans-serif; font-size: ${DEFAULT_SIZE}pt; }
    h1 { font-size: 14pt; margin: 0 0 8px; color: #065f46; }
    table { border-collapse: collapse; ${opts.fitWidth ? 'width: 100%; table-layout: fixed;' : ''} }
    td { padding: 2px 4px; vertical-align: bottom; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
         ${opts.gridlines ? 'border: 0.5pt solid #c8c8c8;' : 'border: 0.5pt solid transparent;'} }
    td.wrap { white-space: pre-wrap; word-break: break-word; }
    tr { page-break-inside: avoid; }
    .empty { color: #666; font-style: italic; }
  `;
  let body = '';
  if (opts.showTitle) body += `<h1>${esc(opts.title)}</h1>`;
  if (!area) {
    body += '<p class="empty">A planilha está vazia.</p>';
  } else {
    const cols: number[] = [];
    for (let c = area.c1; c <= area.c2; c++) cols.push(sheet.colWidth(c));
    const totalW = cols.reduce((a, b) => a + b, 0);
    body += '<table><colgroup>';
    for (const w of cols) body += opts.fitWidth ? `<col style="width:${((w / totalW) * 100).toFixed(3)}%">` : `<col style="width:${w}px">`;
    body += '</colgroup>';
    for (let r = area.r1; r <= area.r2; r++) {
      if (sheet.hiddenRows.has(r)) continue;
      const h = sheet.rowHeight(r);
      body += `<tr style="height:${h}px">`;
      for (let c = area.c1; c <= area.c2; c++) {
        const cell = sheet.get(r, c);
        const s = cell?.s;
        const v = wb.value(sheet, r, c);
        const text = cell ? formatValue(v, s) : '';
        // Texto à esquerda pode ocupar as células vazias ao lado (como na tela).
        let span = 1;
        if (text && typeof v === 'string' && !s?.wrap && (s?.align ?? 'left') === 'left' && !s?.fill && !(s?.br)) {
          while (c + span <= area.c2) {
            const n = sheet.get(r, c + span);
            if (n && (n.v != null || n.f != null || n.s?.fill || n.s?.bl || n.s?.bt || n.s?.bb)) break;
            span++;
          }
        }
        const st: string[] = [];
        if (s) {
          if (s.b) st.push('font-weight:bold');
          if (s.i) st.push('font-style:italic');
          if (s.u) st.push('text-decoration:underline');
          if (s.size) st.push(`font-size:${Math.max(4, Math.min(96, s.size))}pt`);
          if (s.font) st.push(`font-family:'${safeFont(s.font)}'`);
          const col = safeColor(s.color);
          if (col) st.push(`color:${col}`);
          const fill = safeColor(s.fill);
          if (fill) st.push(`background:${fill}`);
          if (s.valign) st.push(`vertical-align:${s.valign}`);
          const b = '0.75pt solid #555';
          if (s.bt) st.push(`border-top:${b}`);
          if (s.bb) st.push(`border-bottom:${b}`);
          if (s.bl) st.push(`border-left:${b}`);
          if (s.br) st.push(`border-right:${b}`);
        }
        const align = s?.align ?? (typeof v === 'number' || isError(v) ? 'right' : typeof v === 'boolean' ? 'center' : 'left');
        st.push(`text-align:${align}`);
        body += `<td${span > 1 ? ` colspan="${span}"` : ''}${s?.wrap ? ' class="wrap"' : ''} style="${st.join(';')}">${esc(text)}</td>`;
        c += span - 1;
      }
      body += '</tr>';
    }
    body += '</table>';
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(opts.title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}
