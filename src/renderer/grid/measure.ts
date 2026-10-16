// Medição de texto e fonte usada pela grade.
import { CellStyle, DEFAULT_FONT, DEFAULT_SIZE } from '../../core/model';

let ctx: CanvasRenderingContext2D | null = null;

export function fontPx(s: CellStyle | undefined, zoom: number): number {
  return ((s?.size ?? DEFAULT_SIZE) * 4) / 3 * zoom;
}

export function cellFont(s: CellStyle | undefined, zoom: number): string {
  const fam = (s?.font ?? DEFAULT_FONT).replace(/["\\]/g, '');
  return `${s?.i ? 'italic ' : ''}${s?.b ? 'bold ' : ''}${fontPx(s, zoom).toFixed(2)}px "${fam}", "Segoe UI", sans-serif`;
}

export function measureText(text: string, font: string): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}
