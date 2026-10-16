// Importação e exportação de CSV.
// Exportação: separador ";" e UTF-8 com BOM (padrão do Excel em português).
// Importação: detecta ";", "," ou tabulação; números com vírgula ou ponto decimal.

import { cellKey, keyCol, keyRow } from '../address';
import { formatValue, parseInput, parseNumberBR } from '../format';
import { Cell, Sheet, SheetJSON } from '../model';
import { Workbook } from '../workbook';

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20000).split(/\r?\n/).slice(0, 20);
  const cands = [';', ',', '\t', '|'];
  let best = ';';
  let bestScore = -1;
  for (const d of cands) {
    const counts = sample.filter((l) => l.length).map((l) => splitLine(l, d).length);
    if (!counts.length) continue;
    const first = counts[0];
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === d) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCSV(text: string, delimiter?: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(t);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"' && cur === '') {
      q = true;
    } else if (ch === d) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Converte o texto de um CSV numa aba. Fórmulas não são executadas: entram como texto. */
export function csvToSheet(text: string, name: string): { sheet: SheetJSON; delimiter: string; rows: number } {
  const t = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(t);
  const grid = parseCSV(t, delimiter);
  const s = new Sheet(name);
  grid.forEach((row, r) => {
    row.forEach((raw, c) => {
      if (raw === '') return;
      let cell: Cell;
      if (raw.startsWith('=') || raw.startsWith("'")) {
        cell = { v: raw };
      } else if (delimiter === ',' && /^[-+]?\d+\.\d+$/.test(raw.trim())) {
        cell = { v: parseFloat(raw) };
      } else {
        const p = parseInput(raw);
        cell = { v: p.v };
        if (p.fmt) cell.s = { fmt: p.fmt, ...(p.dec !== undefined ? { dec: p.dec } : {}) };
      }
      s.cells.set(cellKey(r, c), cell);
    });
  });
  // Primeira linha em negrito quando parece cabeçalho (só texto, e a próxima tem números).
  const first = grid[0] ?? [];
  const second = grid[1] ?? [];
  if (first.length && first.every((x) => x === '' || parseNumberBR(x) === null) && second.some((x) => parseNumberBR(x) !== null)) {
    first.forEach((x, c) => {
      if (x === '') return;
      const k = cellKey(0, c);
      s.cells.set(k, { ...s.cells.get(k)!, s: { b: true } });
    });
  }
  return {
    sheet: {
      name,
      cells: [...s.cells].map(([k, cell]) => [keyRow(k), keyCol(k), cell]),
      colWidths: [],
      rowHeights: [],
      hiddenRows: [],
      freezeRows: 0,
      filter: null,
    },
    delimiter,
    rows: grid.length,
  };
}

function quoteField(t: string, d: string): string {
  if (t.includes(d) || /["\r\n]/.test(t) || /^\s|\s$/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

/** Exporta a aba como CSV (texto exatamente como aparece na tela). */
export function sheetToCSV(wb: Workbook, sheet: Sheet, delimiter = ';'): string {
  const u = sheet.usedData();
  const lines: string[] = [];
  for (let r = 0; r < u.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < u.cols; c++) {
      const cell = sheet.get(r, c);
      const t = cell ? formatValue(wb.value(sheet, r, c), cell.s) : '';
      row.push(quoteField(t, delimiter));
    }
    lines.push(row.join(delimiter));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
