// Desenho da grade em <canvas>. Só as células visíveis são desenhadas.

import { colToLetters, Range } from '../../core/address';
import { formatNumberBR, formatValue } from '../../core/format';
import { CellStyle, isError, Sheet } from '../../core/model';
import { Workbook } from '../../core/workbook';
import { Axis } from './geometry';
import { cellFont, fontPx } from './measure';

export const COLORS = {
  bg: '#ffffff',
  grid: '#e2e5e3',
  headerBg: '#f3f5f4',
  headerText: '#4b5563',
  headerLine: '#d3d8d5',
  headerSelBg: '#d1fae5',
  headerSelText: '#065f46',
  headerSelLine: '#059669',
  sel: '#059669',
  selFill: 'rgba(16,185,129,0.10)',
  border: '#3f3f46',
  freeze: '#9aa5a0',
  clip: '#059669',
  error: '#b91c1c',
};

export const REF_COLORS = ['#2563eb', '#dc2626', '#7c3aed', '#16a34a', '#ea580c', '#0891b2', '#db2777'];

export interface DrawParams {
  wb: Workbook;
  sheet: Sheet;
  rows: Axis;
  cols: Axis;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: number;
  hdrW: number;
  hdrH: number;
  sel: Range;
  active: { r: number; c: number };
  showActive: boolean;
  clip: Range | null;
  refs: { range: Range; color: string }[];
  fillPreview: Range | null;
}

export interface Layout {
  frozenH: number;
  firstRow: number;
  lastRow: number;
  firstCol: number;
  lastCol: number;
}

/** Posição (no canvas) da linha r. */
export function rowY(p: Pick<DrawParams, 'rows' | 'scrollY' | 'hdrH' | 'sheet'>, r: number): number {
  const frozen = r < p.sheet.freezeRows;
  return p.hdrH + p.rows.pos(r) - (frozen ? 0 : p.scrollY);
}

export function colX(p: Pick<DrawParams, 'cols' | 'scrollX' | 'hdrW'>, c: number): number {
  return p.hdrW + p.cols.pos(c) - p.scrollX;
}

export function computeLayout(p: DrawParams): Layout {
  const frozenH = p.rows.pos(p.sheet.freezeRows);
  const firstRow = Math.max(p.sheet.freezeRows, p.rows.indexAt(p.scrollY + frozenH));
  const lastRow = p.rows.indexAt(p.scrollY + p.height - p.hdrH);
  const firstCol = p.cols.indexAt(p.scrollX);
  const lastCol = p.cols.indexAt(p.scrollX + p.width - p.hdrW);
  return { frozenH, firstRow, lastRow, firstCol, lastCol };
}

function cellText(wb: Workbook, sheet: Sheet, r: number, c: number, s: CellStyle | undefined): { text: string; isNum: boolean; isErr: boolean; isBool: boolean } {
  const v = wb.value(sheet, r, c);
  return { text: formatValue(v, s), isNum: typeof v === 'number', isErr: isError(v), isBool: typeof v === 'boolean' };
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function fitNumber(ctx: CanvasRenderingContext2D, v: number, text: string, s: CellStyle | undefined, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  if (!s?.fmt || s.fmt === 'general') {
    // Formato geral: reduz casas decimais até caber.
    for (let p = 10; p >= 1; p--) {
      const t = formatNumberBR(parseFloat(v.toPrecision(p)), undefined, false);
      if (ctx.measureText(t).width <= maxW) return t;
    }
  }
  let hash = '#';
  while (ctx.measureText(hash + '#').width <= maxW && hash.length < 40) hash += '#';
  return hash;
}

export function draw(ctx: CanvasRenderingContext2D, p: DrawParams): Layout {
  const { wb, sheet, rows, cols, width, height, hdrW, hdrH, zoom } = p;
  const L = computeLayout(p);
  ctx.save();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';

  // Faixas de linhas a desenhar: congeladas + roláveis.
  const bands: { r1: number; r2: number; clipTop: number; clipBottom: number }[] = [];
  if (sheet.freezeRows > 0) bands.push({ r1: 0, r2: sheet.freezeRows - 1, clipTop: hdrH, clipBottom: hdrH + L.frozenH });
  bands.push({ r1: L.firstRow, r2: L.lastRow, clipTop: hdrH + L.frozenH, clipBottom: height });

  const lastColX = colX(p, L.lastCol) + cols.size(L.lastCol);

  for (const band of bands) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(hdrW, band.clipTop, width - hdrW, band.clipBottom - band.clipTop);
    ctx.clip();

    const yEnd = Math.min(band.clipBottom, rowY(p, band.r2) + rows.size(band.r2));

    // 1. Linhas de grade
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = band.r1; r <= band.r2; r++) {
      const h = rows.size(r);
      if (!h) continue;
      const y = Math.round(rowY(p, r) + h) - 0.5;
      ctx.moveTo(hdrW, y);
      ctx.lineTo(Math.min(width, lastColX), y);
    }
    for (let c = L.firstCol; c <= L.lastCol; c++) {
      const x = Math.round(colX(p, c) + cols.size(c)) - 0.5;
      ctx.moveTo(x, band.clipTop);
      ctx.lineTo(x, yEnd);
    }
    ctx.stroke();

    // 2. Preenchimentos
    for (let r = band.r1; r <= band.r2; r++) {
      const h = rows.size(r);
      if (!h) continue;
      const y = Math.round(rowY(p, r));
      for (let c = L.firstCol; c <= L.lastCol; c++) {
        const fill = sheet.get(r, c)?.s?.fill;
        if (!fill) continue;
        const x = Math.round(colX(p, c));
        ctx.fillStyle = fill;
        ctx.fillRect(x - 1, y - 1, Math.round(cols.size(c)) + 1, Math.round(h) + 1);
      }
    }

    // 3. Texto (começa algumas colunas antes para o texto que transborda da esquerda)
    const startCol = Math.max(0, L.firstCol - 8);
    const pad = 4 * zoom;
    for (let r = band.r1; r <= band.r2; r++) {
      const h = rows.size(r);
      if (!h) continue;
      const y = rowY(p, r);
      for (let c = startCol; c <= L.lastCol; c++) {
        const cell = sheet.get(r, c);
        if (!cell || (cell.v == null && cell.f == null)) continue;
        const s = cell.s;
        const { text, isNum, isErr, isBool } = cellText(wb, sheet, r, c, s);
        if (text === '') continue;
        const x = colX(p, c);
        const w = cols.size(c);
        ctx.font = cellFont(s, zoom);
        const align = s?.align ?? (isNum || isErr ? 'right' : isBool ? 'center' : 'left');
        let shown = text;
        const clipL = x;
        let clipR = x + w;
        if (s?.wrap && !isNum) {
          const lines = wrapLines(ctx, text, w - 2 * pad);
          const lh = fontPx(s, zoom) * 1.25;
          const total = lines.length * lh;
          let ty = s.valign === 'top' ? y + pad + lh / 2 : s.valign === 'bottom' ? y + h - pad - total + lh / 2 : y + (h - total) / 2 + lh / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          ctx.clip();
          ctx.fillStyle = isErr ? COLORS.error : (s.color ?? '#111827');
          for (const line of lines) {
            const lw = ctx.measureText(line).width;
            const tx = align === 'right' ? x + w - pad - lw : align === 'center' ? x + (w - lw) / 2 : x + pad;
            ctx.fillText(line, tx, ty);
            if (s.u) ctx.fillRect(tx, ty + fontPx(s, zoom) * 0.45, lw, Math.max(1, zoom));
            ty += lh;
          }
          ctx.restore();
          continue;
        }
        if (isNum) {
          shown = fitNumber(ctx, wb.value(sheet, r, c) as number, text, s, w - 2 * pad);
        } else {
          const tw = ctx.measureText(text).width;
          if (tw > w - 2 * pad && align === 'left') {
            // Transborda para as células vazias à direita (como no Excel).
            let nc = c + 1;
            while (clipR - x < tw + 2 * pad && nc <= L.lastCol + 20) {
              const n = sheet.get(r, nc);
              if (n && (n.v != null || n.f != null)) break;
              const bx = Math.round(clipR) - 0.5;
              // apaga a linha de grade que o texto atravessa
              ctx.fillStyle = n?.s?.fill ?? sheet.get(r, nc - 1)?.s?.fill ?? COLORS.bg;
              ctx.fillRect(bx - 0.5, Math.round(y), 1.5, Math.round(h) - 1);
              clipR += cols.size(nc);
              nc++;
            }
          }
          if (c < L.firstCol && clipR < colX(p, L.firstCol)) continue;
        }
        const tw = ctx.measureText(shown).width;
        const tx = align === 'right' ? x + w - pad - tw : align === 'center' ? x + (w - tw) / 2 : x + pad;
        const fs = fontPx(s, zoom);
        const ty = s?.valign === 'top' ? y + pad + fs / 2 : s?.valign === 'bottom' ? y + h - pad - fs / 2 : y + h / 2 + 0.5;
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipL, y, clipR - clipL, h);
        ctx.clip();
        ctx.fillStyle = isErr ? COLORS.error : (s?.color ?? '#111827');
        ctx.fillText(shown, tx, ty);
        if (s?.u) ctx.fillRect(tx, ty + fs * 0.45, tw, Math.max(1, Math.round(zoom)));
        ctx.restore();
      }
    }

    // 4. Bordas definidas pela pessoa
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = band.r1; r <= band.r2; r++) {
      const h = rows.size(r);
      if (!h) continue;
      const y = Math.round(rowY(p, r));
      for (let c = L.firstCol; c <= L.lastCol; c++) {
        const s = sheet.get(r, c)?.s;
        if (!s || !(s.bt || s.bb || s.bl || s.br)) continue;
        const x = Math.round(colX(p, c));
        const w = Math.round(cols.size(c));
        const hh = Math.round(h);
        if (s.bt) {
          ctx.moveTo(x - 1, y - 0.5);
          ctx.lineTo(x + w, y - 0.5);
        }
        if (s.bb) {
          ctx.moveTo(x - 1, y + hh - 0.5);
          ctx.lineTo(x + w, y + hh - 0.5);
        }
        if (s.bl) {
          ctx.moveTo(x - 0.5, y - 1);
          ctx.lineTo(x - 0.5, y + hh);
        }
        if (s.br) {
          ctx.moveTo(x + w - 0.5, y - 1);
          ctx.lineTo(x + w - 0.5, y + hh);
        }
      }
    }
    ctx.stroke();

    // 5. Seleção, área copiada, referências da fórmula
    drawRangeOverlays(ctx, p);
    ctx.restore();
  }

  // Linha que separa a parte congelada
  if (sheet.freezeRows > 0) {
    ctx.strokeStyle = COLORS.freeze;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const y = Math.round(hdrH + L.frozenH) - 0.25;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  drawHeaders(ctx, p, L);
  ctx.restore();
  return L;
}

function rangeRect(p: DrawParams, r: Range): { x: number; y: number; w: number; h: number } {
  const x = colX(p, r.c1);
  const x2 = colX(p, r.c2) + p.cols.size(r.c2);
  const y = rowY(p, r.r1);
  const y2 = rowY(p, Math.min(r.r2, p.rows.count - 1)) + p.rows.size(Math.min(r.r2, p.rows.count - 1));
  return { x, y, w: x2 - x, h: Math.max(0, y2 - y) };
}

function drawRangeOverlays(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const z = p.zoom;
  for (const ref of p.refs) {
    const rr = rangeRect(p, ref.range);
    ctx.fillStyle = ref.color + '18';
    ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
    ctx.strokeStyle = ref.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(rr.x) + 0.5, Math.round(rr.y) + 0.5, Math.round(rr.w) - 1, Math.round(rr.h) - 1);
  }

  const sel = p.sel;
  const multi = sel.r1 !== sel.r2 || sel.c1 !== sel.c2;
  const rr = rangeRect(p, sel);
  if (multi) {
    // Sombreia a seleção, menos a célula ativa (que fica limpa, como no Excel).
    const a = rangeRect(p, { r1: p.active.r, c1: p.active.c, r2: p.active.r, c2: p.active.c });
    ctx.save();
    ctx.beginPath();
    ctx.rect(rr.x, rr.y, rr.w, rr.h);
    if (p.showActive) ctx.rect(a.x + a.w, a.y, -a.w, a.h);
    ctx.clip('evenodd');
    ctx.fillStyle = COLORS.selFill;
    ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
    ctx.restore();
    if (p.showActive) {
      ctx.strokeStyle = COLORS.sel;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(a.w) - 1, Math.round(a.h) - 1);
    }
  }
  ctx.strokeStyle = COLORS.sel;
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(rr.x), Math.round(rr.y), Math.round(rr.w) - 1, Math.round(rr.h) - 1);
  // Alça de preenchimento
  const hs = Math.max(6, Math.round(7 * z));
  const hx = Math.round(rr.x + rr.w) - hs / 2 - 1;
  const hy = Math.round(rr.y + rr.h) - hs / 2 - 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hx - 1, hy - 1, hs + 2, hs + 2);
  ctx.fillStyle = COLORS.sel;
  ctx.fillRect(hx, hy, hs, hs);

  if (p.fillPreview) {
    const fr = rangeRect(p, p.fillPreview);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(fr.x) + 0.5, Math.round(fr.y) + 0.5, Math.round(fr.w) - 1, Math.round(fr.h) - 1);
    ctx.setLineDash([]);
  }

  if (p.clip) {
    const cr = rangeRect(p, p.clip);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = COLORS.clip;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(cr.x) + 1, Math.round(cr.y) + 1, Math.round(cr.w) - 3, Math.round(cr.h) - 3);
    ctx.setLineDash([]);
  }
}

/** Retângulo do botão de filtro de uma coluna (coordenadas do canvas) ou null. */
export function filterButtonRect(p: DrawParams, c: number): { x: number; y: number; w: number; h: number } | null {
  const f = p.sheet.filter;
  if (!f || c < f.c1 || c > f.c2) return null;
  const h = p.rows.size(f.headerRow);
  if (!h) return null;
  const size = Math.min(h - 4, 18 * p.zoom);
  const x = colX(p, c) + p.cols.size(c) - size - 3;
  const y = rowY(p, f.headerRow) + (h - size) / 2;
  return { x, y, w: size, h: size };
}

function drawFilterButtons(ctx: CanvasRenderingContext2D, p: DrawParams, L: Layout): void {
  const f = p.sheet.filter;
  if (!f) return;
  const top = f.headerRow < p.sheet.freezeRows ? p.hdrH : p.hdrH + L.frozenH;
  const yHdr = rowY(p, f.headerRow);
  if (yHdr + p.rows.size(f.headerRow) < top || yHdr > p.height) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.hdrW, top, p.width - p.hdrW, p.height - top);
  ctx.clip();
  for (let c = Math.max(f.c1, L.firstCol); c <= Math.min(f.c2, L.lastCol); c++) {
    const b = filterButtonRect(p, c);
    if (!b) continue;
    const active = !!f.allowed[c];
    ctx.fillStyle = active ? '#059669' : '#ffffff';
    ctx.strokeStyle = active ? '#047857' : '#9ca3af';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5, Math.round(b.w), Math.round(b.h), 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#ffffff' : '#374151';
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const t = b.w * 0.22;
    ctx.beginPath();
    if (active) {
      // funil
      ctx.moveTo(cx - t * 1.4, cy - t);
      ctx.lineTo(cx + t * 1.4, cy - t);
      ctx.lineTo(cx + t * 0.3, cy + t * 0.2);
      ctx.lineTo(cx + t * 0.3, cy + t * 1.3);
      ctx.lineTo(cx - t * 0.3, cy + t * 1.0);
      ctx.lineTo(cx - t * 0.3, cy + t * 0.2);
    } else {
      ctx.moveTo(cx - t, cy - t * 0.5);
      ctx.lineTo(cx + t, cy - t * 0.5);
      ctx.lineTo(cx, cy + t * 0.7);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHeaders(ctx: CanvasRenderingContext2D, p: DrawParams, L: Layout): void {
  const { width, height, hdrW, hdrH, cols, rows, sel, zoom, sheet } = p;
  drawFilterButtons(ctx, p, L);
  ctx.font = `${(12 * zoom).toFixed(1)}px "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Cabeçalho das colunas
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(hdrW, 0, width - hdrW, hdrH);
  const fullCols = sel.r1 === 0 && sel.r2 >= rows.count - 1;
  for (let c = L.firstCol; c <= L.lastCol; c++) {
    const x = colX(p, c);
    const w = cols.size(c);
    const on = c >= sel.c1 && c <= sel.c2;
    if (on) {
      ctx.fillStyle = fullCols ? '#a7f3d0' : COLORS.headerSelBg;
      ctx.fillRect(x, 0, w, hdrH);
      ctx.fillStyle = COLORS.headerSelLine;
      ctx.fillRect(x, hdrH - 2, w, 2);
    }
    ctx.fillStyle = on ? COLORS.headerSelText : COLORS.headerText;
    if (w > 10) ctx.fillText(colToLetters(c), x + w / 2, hdrH / 2 + 0.5);
    ctx.fillStyle = COLORS.headerLine;
    ctx.fillRect(Math.round(x + w) - 1, 0, 1, hdrH);
  }
  ctx.fillStyle = COLORS.headerLine;
  ctx.fillRect(hdrW, hdrH - 1, width - hdrW, 1);

  // Cabeçalho das linhas
  const fullRows = sel.c1 === 0 && sel.c2 >= cols.count - 1;
  const drawRowHdr = (r: number, clipTop: number) => {
    const h = rows.size(r);
    if (!h) return;
    const y = rowY(p, r);
    if (y + h < clipTop || y > height) return;
    const on = r >= sel.r1 && r <= sel.r2;
    ctx.fillStyle = on ? (fullRows ? '#a7f3d0' : COLORS.headerSelBg) : COLORS.headerBg;
    ctx.fillRect(0, y, hdrW, h);
    if (on) {
      ctx.fillStyle = COLORS.headerSelLine;
      ctx.fillRect(hdrW - 2, y, 2, h);
    }
    // Linhas escondidas pelo filtro: número em azul (como no Excel)
    const filtered = sheet.filter && r > sheet.filter.headerRow && (sheet.hiddenRows.has(r - 1) || sheet.hiddenRows.has(r + 1));
    ctx.fillStyle = on ? COLORS.headerSelText : filtered ? '#2563eb' : COLORS.headerText;
    if (h > 8) ctx.fillText(String(r + 1), hdrW / 2, y + h / 2 + 0.5);
    ctx.fillStyle = COLORS.headerLine;
    ctx.fillRect(0, Math.round(y + h) - 1, hdrW, 1);
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hdrH + L.frozenH, hdrW, height);
  ctx.clip();
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(0, hdrH, hdrW, height - hdrH);
  for (let r = L.firstRow; r <= L.lastRow; r++) drawRowHdr(r, hdrH + L.frozenH);
  ctx.restore();
  for (let r = 0; r < sheet.freezeRows; r++) drawRowHdr(r, hdrH);
  ctx.fillStyle = COLORS.headerLine;
  ctx.fillRect(hdrW - 1, hdrH, 1, height - hdrH);

  // Canto (selecionar tudo)
  ctx.fillStyle = fullRows && fullCols ? '#a7f3d0' : COLORS.headerBg;
  ctx.fillRect(0, 0, hdrW, hdrH);
  ctx.fillStyle = '#b6bfbb';
  ctx.beginPath();
  ctx.moveTo(hdrW - 4, hdrH - 4);
  ctx.lineTo(hdrW - 4, hdrH - 4 - 10 * zoom);
  ctx.lineTo(hdrW - 4 - 10 * zoom, hdrH - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.headerLine;
  ctx.fillRect(hdrW - 1, 0, 1, hdrH);
  ctx.fillRect(0, hdrH - 1, hdrW, 1);
  ctx.textAlign = 'left';
}
