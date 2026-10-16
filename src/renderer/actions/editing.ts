// Ações de edição usadas pelo teclado, pela faixa de opções e pelos menus.

import { keyCol, keyRow, MAX_COLS, MAX_ROWS, Range } from '../../core/address';
import { formatNumberBR } from '../../core/format';
import { CellStyle, NumFmt } from '../../core/model';
import { copyRange, detectRegion, displayText, fillRange, pasteClip, PasteMode, pasteText } from '../../core/ops';
import { InputError, Workbook } from '../../core/workbook';
import { alertMsg, confirm, prompt } from '../dialogs';
import { gridBus } from '../grid/bus';
import { cellFont, measureText } from '../grid/measure';
import { cellSel, currentSheet, Editing, getState, Sel, selRange, setState, toast } from '../store';

// ---------------- foco e seleção ----------------

export function focusGrid(): void {
  const doFocus = () => {
    const el = document.activeElement as HTMLElement | null;
    // Não rouba o foco de campos de texto de painéis abertos.
    if (el && el.id !== 'cell-editor' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && el.closest('[role="dialog"],[data-keep-focus]')) return;
    document.getElementById('cell-editor')?.focus({ preventScroll: true });
  };
  // Imediatamente (para não perder teclas digitadas logo em seguida) e de novo depois que a tela atualizar.
  doFocus();
  setTimeout(doFocus, 0);
}

const clampR = (r: number) => Math.max(0, Math.min(MAX_ROWS - 1, r));
const clampC = (c: number) => Math.max(0, Math.min(MAX_COLS - 1, c));

export function setSel(sel: Sel, scroll = true): void {
  const s: Sel = { ar: clampR(sel.ar), ac: clampC(sel.ac), fr: clampR(sel.fr), fc: clampC(sel.fc) };
  setState({ sel: s, formulaError: null });
  if (scroll) gridBus.ensureVisible(s.fr, s.fc);
}

function hidden(r: number): boolean {
  return !!currentSheet()?.hiddenRows.has(r);
}

function stepRow(r: number, dr: number): number {
  let n = clampR(r + dr);
  while (hidden(n) && n > 0 && n < MAX_ROWS - 1) n = clampR(n + Math.sign(dr));
  return hidden(n) ? r : n;
}

function hasData(r: number, c: number): boolean {
  const x = currentSheet()?.get(r, c);
  return !!x && (x.v != null || x.f != null);
}

/** Ctrl+seta: vai até a borda do bloco de dados (como no Excel). */
function jump(r: number, c: number, dr: number, dc: number): [number, number] {
  const sh = currentSheet()!;
  const u = sh.usedData();
  const inb = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < MAX_ROWS && cc < MAX_COLS;
  let nr = r + dr;
  let nc = c + dc;
  if (!inb(nr, nc)) return [r, c];
  if (hasData(r, c) && hasData(nr, nc)) {
    while (inb(nr + dr, nc + dc) && hasData(nr + dr, nc + dc)) {
      nr += dr;
      nc += dc;
    }
    return [nr, nc];
  }
  const limR = Math.max(u.rows, r + 1);
  const limC = Math.max(u.cols, c + 1);
  while (inb(nr, nc) && !hasData(nr, nc) && nr <= limR && nc <= limC) {
    nr += dr;
    nc += dc;
  }
  if (!inb(nr, nc) || nr > limR || nc > limC) return [dr ? (dr > 0 ? Math.max(u.rows - 1, r) : 0) : r, dc ? (dc > 0 ? Math.max(u.cols - 1, c) : 0) : c];
  return [nr, nc];
}

export function moveActive(dr: number, dc: number, extend = false, ctrl = false): void {
  const { sel } = getState();
  const baseR = extend ? sel.fr : sel.ar;
  const baseC = extend ? sel.fc : sel.ac;
  let nr: number;
  let nc: number;
  if (ctrl) [nr, nc] = jump(baseR, baseC, dr, dc);
  else {
    nr = dr ? stepRow(baseR, dr) : baseR;
    nc = clampC(baseC + dc);
  }
  if (extend) setSel({ ...sel, fr: nr, fc: nc });
  else setSel(cellSel(nr, nc));
}

/** Enter/Tab dentro de uma seleção com várias células percorre só a seleção. */
export function moveWithinSelection(dr: number, dc: number): void {
  const { sel } = getState();
  const rg = selRange(sel);
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) {
    moveActive(dr, dc);
    return;
  }
  let r = sel.ar + dr;
  let c = sel.ac + dc;
  if (dc) {
    if (c > rg.c2) {
      c = rg.c1;
      r = r + 1 > rg.r2 ? rg.r1 : r + 1;
    } else if (c < rg.c1) {
      c = rg.c2;
      r = r - 1 < rg.r1 ? rg.r2 : r - 1;
    }
  } else if (dr) {
    if (r > rg.r2) {
      r = rg.r1;
      c = c + 1 > rg.c2 ? rg.c1 : c + 1;
    } else if (r < rg.r1) {
      r = rg.r2;
      c = c - 1 < rg.c1 ? rg.c2 : c - 1;
    }
  }
  setState({ sel: { ...sel, ar: r, ac: c } });
  gridBus.ensureVisible(r, c);
}

export function selectAll(): void {
  setSel({ ar: 0, ac: 0, fr: MAX_ROWS - 1, fc: MAX_COLS - 1 }, false);
}

export function selectSheet(index: number): void {
  if (!commitEdit('none')) return;
  const s = getState();
  if (!s.wb || index < 0 || index >= s.wb.sheets.length) return;
  const cur = currentSheet();
  const selBySheet = { ...s.selBySheet };
  if (cur) selBySheet[cur.uid] = s.sel;
  const next = s.wb.sheets[index];
  setState({ active: index, selBySheet, sel: selBySheet[next.uid] ?? cellSel(0, 0), panel: null });
  gridBus.resetScroll();
  focusGrid();
}

// ---------------- edição de célula ----------------

export function startEdit(mode: Editing['mode'], text?: string, source: Editing['source'] = 'cell'): void {
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh) return;
  const { ar, ac } = s.sel;
  const original = s.wb.editText(sh, ar, ac);
  setState({ editing: { row: ar, col: ac, text: text ?? original, mode, source, original }, formulaError: null });
}

export function updateEditText(text: string): void {
  const e = getState().editing;
  if (e) setState({ editing: { ...e, text } });
}

function balanceParens(text: string): string {
  let depth = 0;
  let inStr = false;
  for (const ch of text) {
    if (ch === '"') inStr = !inStr;
    else if (!inStr && ch === '(') depth++;
    else if (!inStr && ch === ')') depth--;
  }
  return depth > 0 ? text + ')'.repeat(depth) : text;
}

/** Confirma a edição. Devolve false se a fórmula tiver erro (a edição continua aberta). */
export function commitEdit(move: 'down' | 'up' | 'right' | 'left' | 'none'): boolean {
  const s = getState();
  const e = s.editing;
  if (!e) return true;
  const sh = currentSheet();
  if (!s.wb || !sh) return true;
  if (e.text !== e.original) {
    try {
      let text = e.text;
      if (text.startsWith('=')) {
        // Fecha parênteses esquecidos automaticamente, como o Excel.
        const fixed = balanceParens(text);
        try {
          s.wb.cellFromInput(sh, e.row, e.col, fixed);
          text = fixed;
        } catch {
          /* mantém o texto original para mostrar o erro */
        }
      }
      s.wb.setInput(sh, e.row, e.col, text);
    } catch (err) {
      if (err instanceof InputError) {
        setState({ formulaError: err.message });
        return false;
      }
      throw err;
    }
  }
  setState({ editing: null, formulaError: null });
  if (move === 'down') moveWithinSelection(1, 0);
  else if (move === 'up') moveWithinSelection(-1, 0);
  else if (move === 'right') moveWithinSelection(0, 1);
  else if (move === 'left') moveWithinSelection(0, -1);
  focusGrid();
  return true;
}

/** Guarda o texto digitado como texto puro (quando a fórmula está errada). */
export function commitAsText(): void {
  const e = getState().editing;
  if (!e) return;
  setState({ editing: { ...e, text: "'" + e.text } });
  commitEdit('down');
}

export function cancelEdit(): void {
  setState({ editing: null, formulaError: null });
  focusGrid();
}

/** Preenche a seleção com o texto (Ctrl+Enter). */
export function commitToSelection(): void {
  const s = getState();
  const e = s.editing;
  const sh = currentSheet();
  if (!e || !s.wb || !sh) return;
  const rg = selRange(s.sel);
  const n = (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1);
  if (n <= 1 || n > 100000) {
    commitEdit('none');
    return;
  }
  try {
    const wb = s.wb;
    const first = wb.cellFromInput(sh, e.row, e.col, e.text);
    if (first?.f) {
      // Fórmula: cada célula recebe a fórmula com as referências relativas ajustadas.
      wb.transact('Preencher seleção', () => {
        wb.setCell(sh, e.row, e.col, first);
        fillRange(wb, sh, { r1: e.row, c1: e.col, r2: e.row, c2: e.col }, rg);
      });
    } else {
      const items = [];
      for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) items.push({ row: r, col: c, cell: wb.cellFromInput(sh, r, c, e.text) });
      wb.setCells(sh, items, 'Preencher seleção');
    }
    setState({ editing: null, formulaError: null });
    focusGrid();
  } catch (err) {
    if (err instanceof InputError) setState({ formulaError: err.message });
    else throw err;
  }
}

// ---------------- área de transferência ----------------

function wbSheet(): { wb: Workbook; sh: NonNullable<ReturnType<typeof currentSheet>> } | null {
  const wb = getState().wb;
  const sh = currentSheet();
  return wb && sh ? { wb, sh } : null;
}

export async function copySelection(cut = false): Promise<void> {
  const x = wbSheet();
  if (!x || !commitEdit('none')) return;
  const rg = selRange(getState().sel);
  const { clip, html } = copyRange(x.wb, x.sh, rg, cut);
  setState({ clip });
  await window.api.clipboardWrite(clip.text, html);
  toast(cut ? 'Recortado. Clique onde quer colar e use Ctrl+V.' : 'Copiado. Clique onde quer colar e use Ctrl+V.', 'info', 2200);
}

export async function pasteSelection(mode: PasteMode = 'all'): Promise<void> {
  const x = wbSheet();
  if (!x || !commitEdit('none')) return;
  const s = getState();
  const rg = selRange(s.sel);
  const text = await window.api.clipboardRead();
  const norm = (t: string) => t.replace(/\r\n/g, '\n').replace(/\n$/, '');
  let out: Range;
  if (s.clip && norm(text) === norm(s.clip.text)) {
    out = pasteClip(x.wb, x.sh, rg, s.clip, mode);
    if (s.clip.cut) setState({ clip: null });
  } else if (text) {
    if (mode === 'formats') {
      toast('Para colar só a formatação, copie de dentro do Excel Fácil.', 'info');
      return;
    }
    const rows = text.split(/\r?\n/).length;
    if (rows > 200000) {
      await alertMsg('Conteúdo grande demais', 'O conteúdo copiado tem linhas demais para colar de uma vez.', 'warn');
      return;
    }
    out = pasteText(x.wb, x.sh, rg, text);
  } else {
    toast('Não há nada copiado para colar.', 'info');
    return;
  }
  setSel({ ar: out.r1, ac: out.c1, fr: out.r2, fc: out.c2 }, true);
}

export function clearSelection(what: 'contents' | 'formats' | 'all' = 'contents'): void {
  const x = wbSheet();
  if (!x) return;
  x.wb.clearRange(x.sh, x.wb.clampToUsedForStyle(x.sh, selRange(getState().sel)), what);
}

// ---------------- desfazer / refazer ----------------

function revealEntry(entry: ReturnType<Workbook['undo']>): void {
  const wb = getState().wb;
  if (!entry || !wb) return;
  if (!entry.patches.length) return;
  const uid = entry.patches[0].uid;
  const idx = wb.sheets.findIndex((s) => s.uid === uid);
  if (idx < 0) return;
  let r1 = Infinity;
  let c1 = Infinity;
  let r2 = -1;
  let c2 = -1;
  for (const p of entry.patches) {
    if (p.uid !== uid) continue;
    const r = keyRow(p.key);
    const c = keyCol(p.key);
    r1 = Math.min(r1, r);
    c1 = Math.min(c1, c);
    r2 = Math.max(r2, r);
    c2 = Math.max(c2, c);
  }
  if (idx !== getState().active) setState({ active: idx });
  setSel({ ar: r1, ac: c1, fr: r2, fc: c2 });
}

export function undo(): void {
  const wb = getState().wb;
  if (!wb) return;
  if (getState().editing) {
    cancelEdit();
    return;
  }
  const label = wb.undoLabel();
  const e = wb.undo();
  if (!e) {
    toast('Não há nada para desfazer.', 'info', 1800);
    return;
  }
  clampActive();
  revealEntry(e);
  if (label) toast(`Desfeito: ${label}`, 'info', 1600);
}

export function redo(): void {
  const wb = getState().wb;
  if (!wb || getState().editing) return;
  const label = wb.redoLabel();
  const e = wb.redo();
  if (!e) {
    toast('Não há nada para refazer.', 'info', 1800);
    return;
  }
  clampActive();
  revealEntry(e);
  if (label) toast(`Refeito: ${label}`, 'info', 1600);
}

function clampActive(): void {
  const s = getState();
  if (s.wb && s.active >= s.wb.sheets.length) setState({ active: s.wb.sheets.length - 1 });
}

// ---------------- formatação ----------------

export function activeStyle(): CellStyle {
  const s = getState();
  const sh = currentSheet();
  return sh?.get(s.sel.ar, s.sel.ac)?.s ?? {};
}

function styleSel(patch: Partial<CellStyle> | ((s: CellStyle, r: number, c: number) => CellStyle), label = 'Formatar'): void {
  const x = wbSheet();
  if (!x) return;
  if (!commitEdit('none')) return;
  x.wb.applyStyle(x.sh, selRange(getState().sel), patch, label);
  focusGrid();
}

export function toggleFlag(flag: 'b' | 'i' | 'u' | 'wrap'): void {
  const on = !activeStyle()[flag];
  const labels = { b: 'Negrito', i: 'Itálico', u: 'Sublinhado', wrap: 'Quebrar texto' };
  styleSel({ [flag]: on || undefined }, labels[flag]);
}

export function setStyle(patch: Partial<CellStyle>, label?: string): void {
  styleSel(patch, label);
}

export type BorderKind = 'all' | 'outline' | 'bottom' | 'top' | 'none';

export function applyBorders(kind: BorderKind): void {
  const rg = selRange(getState().sel);
  styleSel((s, r, c) => {
    const n = { ...s };
    if (kind === 'none') {
      delete n.bt;
      delete n.bb;
      delete n.bl;
      delete n.br;
    } else if (kind === 'all') Object.assign(n, { bt: true, bb: true, bl: true, br: true });
    else if (kind === 'bottom') {
      if (r === rg.r2) n.bb = true;
    } else if (kind === 'top') {
      if (r === rg.r1) n.bt = true;
    } else {
      if (r === rg.r1) n.bt = true;
      if (r === rg.r2) n.bb = true;
      if (c === rg.c1) n.bl = true;
      if (c === rg.c2) n.br = true;
    }
    return n;
  }, 'Bordas');
}

export function setNumberFormat(fmt: NumFmt, dec?: number): void {
  const labels: Record<NumFmt, string> = { general: 'Formato geral', number: 'Formato número', currency: 'Formato moeda', percent: 'Formato porcentagem', date: 'Formato data', text: 'Formato texto' };
  styleSel((s) => {
    const n: CellStyle = { ...s, fmt };
    delete n.excelFmt;
    if (dec !== undefined) n.dec = dec;
    else if (fmt === 'currency' || fmt === 'number') n.dec = 2;
    else if (fmt === 'percent') n.dec = s.fmt === 'percent' ? s.dec : 0;
    else delete n.dec;
    return n;
  }, labels[fmt]);
}

function decimalsOf(v: unknown, s: CellStyle): number {
  if (s.dec !== undefined) return s.dec;
  if (typeof v !== 'number') return 0;
  const t = formatNumberBR(s.fmt === 'percent' ? v * 100 : v, undefined, false);
  return (t.split(',')[1] ?? '').length;
}

export function changeDecimals(delta: number): void {
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh) return;
  const v = s.wb.value(sh, s.sel.ar, s.sel.ac);
  const st = activeStyle();
  const next = Math.max(0, Math.min(10, decimalsOf(v, st) + delta));
  styleSel((cs) => {
    const n = { ...cs, dec: next };
    if (!n.fmt || n.fmt === 'general') n.fmt = 'number';
    delete n.excelFmt;
    return n;
  }, delta > 0 ? 'Aumentar casas decimais' : 'Diminuir casas decimais');
}

export function clearFormats(): void {
  clearSelection('formats');
}

// ---------------- linhas, colunas e abas ----------------

function selRows(): { at: number; count: number } {
  const rg = selRange(getState().sel);
  const sh = currentSheet()!;
  const r2 = Math.min(rg.r2, Math.max(rg.r1, sh.used().rows - 1, rg.r1));
  return { at: rg.r1, count: Math.min(r2 - rg.r1 + 1, 10000) };
}

function selCols(): { at: number; count: number } {
  const rg = selRange(getState().sel);
  const sh = currentSheet()!;
  const c2 = Math.min(rg.c2, Math.max(rg.c1, sh.used().cols - 1, rg.c1));
  return { at: rg.c1, count: Math.min(c2 - rg.c1 + 1, 1000) };
}

export function insertRows(where: 'above' | 'below'): void {
  const x = wbSheet();
  if (!x || !commitEdit('none')) return;
  const { at, count } = selRows();
  const rg = selRange(getState().sel);
  x.wb.insertRows(x.sh, where === 'above' ? at : rg.r2 + 1, count);
  if (where === 'below') setSel(cellSel(rg.r2 + 1, getState().sel.ac));
}

export function insertCols(where: 'left' | 'right'): void {
  const x = wbSheet();
  if (!x || !commitEdit('none')) return;
  const { at, count } = selCols();
  const rg = selRange(getState().sel);
  x.wb.insertCols(x.sh, where === 'left' ? at : rg.c2 + 1, count);
  if (where === 'right') setSel(cellSel(getState().sel.ar, rg.c2 + 1));
}

function countData(sh: NonNullable<ReturnType<typeof currentSheet>>, r: Range): number {
  let n = 0;
  sh.forEachIn(r, (_r, _c, cell) => {
    if (cell.v != null || cell.f != null) n++;
  });
  return n;
}

export async function deleteRows(): Promise<void> {
  const x = wbSheet();
  if (!x || !commitEdit('none')) return;
  const { at, count } = selRows();
  const n = countData(x.sh, { r1: at, c1: 0, r2: at + count - 1, c2: MAX_COLS - 1 });
  if (n > 0) {
    const ok = await confirm({
      title: count > 1 ? `Excluir ${count} linhas?` : 'Excluir a linha?',
      message: `${count > 1 ? 'As linhas têm' : 'A linha tem'} ${n} célula(s) preenchida(s). Você pode desfazer com Ctrl+Z.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
  }
  x.wb.deleteRows(x.sh, at, count);
  setSel(cellSel(at, getState().sel.ac));
}

export async function deleteCols(): Promise<void> {
  const x = wbSheet();
  if (!x || !commitEdit('none')) return;
  const { at, count } = selCols();
  const n = countData(x.sh, { r1: 0, c1: at, r2: MAX_ROWS - 1, c2: at + count - 1 });
  if (n > 0) {
    const ok = await confirm({
      title: count > 1 ? `Excluir ${count} colunas?` : 'Excluir a coluna?',
      message: `${count > 1 ? 'As colunas têm' : 'A coluna tem'} ${n} célula(s) preenchida(s). Você pode desfazer com Ctrl+Z.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
  }
  x.wb.deleteCols(x.sh, at, count);
  setSel(cellSel(getState().sel.ar, at));
}

export function addSheet(): void {
  const wb = getState().wb;
  if (!wb || !commitEdit('none')) return;
  wb.addSheet(undefined, getState().active + 1);
  selectSheet(getState().active + 1);
}

export async function renameSheet(index = getState().active): Promise<void> {
  const wb = getState().wb;
  if (!wb) return;
  const sh = wb.sheets[index];
  const name = await prompt({
    title: 'Renomear aba',
    message: 'Digite o novo nome da aba:',
    value: sh.name,
    confirmLabel: 'Renomear',
    validate: (v) => Workbook.validateSheetName(v) ?? (wb.sheetByName(v.trim()) && wb.sheetByName(v.trim()) !== sh ? 'Já existe uma aba com esse nome.' : null),
  });
  if (name === null || name.trim() === sh.name) return;
  try {
    wb.renameSheet(sh, name);
  } catch (e) {
    if (e instanceof InputError) await alertMsg('Nome inválido', e.message, 'warn');
  }
  focusGrid();
}

export function renameSheetDirect(index: number, name: string): string | null {
  const wb = getState().wb;
  if (!wb) return null;
  try {
    wb.renameSheet(wb.sheets[index], name);
    return null;
  } catch (e) {
    return e instanceof InputError ? e.message : 'Erro ao renomear.';
  }
}

export function duplicateSheet(index = getState().active): void {
  const wb = getState().wb;
  if (!wb) return;
  wb.duplicateSheet(wb.sheets[index]);
  selectSheet(index + 1);
}

export async function deleteSheet(index = getState().active): Promise<void> {
  const wb = getState().wb;
  if (!wb) return;
  if (wb.sheets.length <= 1) {
    await alertMsg('Não é possível excluir', 'A planilha precisa ter pelo menos uma aba.', 'info');
    return;
  }
  const sh = wb.sheets[index];
  const filled = countData(sh, { r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 });
  const ok = await confirm({
    title: `Excluir a aba "${sh.name}"?`,
    message: filled ? `Ela tem ${filled} célula(s) preenchida(s). Você pode desfazer com Ctrl+Z.` : 'A aba está vazia.',
    confirmLabel: 'Excluir aba',
    danger: true,
  });
  if (!ok) return;
  wb.removeSheet(sh);
  setState({ active: Math.max(0, Math.min(index, wb.sheets.length - 1)), sel: cellSel(0, 0) });
  focusGrid();
}

export function moveSheet(index: number, dir: -1 | 1): void {
  const wb = getState().wb;
  if (!wb) return;
  const to = index + dir;
  if (to < 0 || to >= wb.sheets.length) return;
  wb.moveSheet(index, to);
  setState({ active: to });
}

// ---------------- tamanho, congelar e zoom ----------------

export function autofitColumns(cols?: number[]): void {
  const x = wbSheet();
  if (!x) return;
  const rg = selRange(getState().sel);
  const list = cols ?? Array.from({ length: Math.min(rg.c2, Math.max(x.sh.used().cols - 1, rg.c1)) - rg.c1 + 1 }, (_, i) => rg.c1 + i);
  const widths = new Map<number, number>();
  const u = x.sh.used();
  const set = new Set(list);
  x.sh.forEachIn({ r1: 0, c1: Math.min(...list), r2: Math.max(0, u.rows - 1), c2: Math.max(...list) }, (r, c, cell) => {
    if (!set.has(c) || x.sh.hiddenRows.has(r)) return;
    const t = displayText(x.wb, x.sh, r, c);
    if (!t) return;
    const w = measureText(t, cellFont(cell.s, 1)) + 14;
    widths.set(c, Math.max(widths.get(c) ?? 0, w));
  });
  const items = list.map((c) => ({ c, w: Math.max(40, Math.min(600, widths.get(c) ?? 64)) }));
  x.wb.transact('Ajustar largura', () => {
    for (const { c, w } of items) x.wb.setColWidth(x.sh, [c], w);
  });
}


export function toggleFreeze(): void {
  const x = wbSheet();
  if (!x) return;
  x.wb.setFreezeRows(x.sh, x.sh.freezeRows ? 0 : 1);
  toast(x.sh.freezeRows ? 'A primeira linha fica fixa ao rolar.' : 'A primeira linha voltou a rolar normalmente.', 'info');
}

export function setZoom(z: number): void {
  setState({ zoom: Math.max(50, Math.min(200, Math.round(z / 10) * 10)) });
}

/** Seleção atual ou, se for uma só célula, a tabela ao redor dela. */
export function selectionOrRegion(): Range {
  const s = getState();
  const sh = currentSheet()!;
  const rg = selRange(s.sel);
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return detectRegion(sh, rg.r1, rg.c1);
  const u = sh.usedData();
  return { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, Math.max(rg.r1, u.rows - 1)), c2: Math.min(rg.c2, Math.max(rg.c1, u.cols - 1)) };
}

export function fillDown(): void {
  const x = wbSheet();
  if (!x) return;
  const rg = selRange(getState().sel);
  if (rg.r2 === rg.r1) {
    if (rg.r1 === 0) return;
    fillRange(x.wb, x.sh, { ...rg, r1: rg.r1 - 1, r2: rg.r1 - 1 }, { ...rg, r1: rg.r1 - 1 });
  } else fillRange(x.wb, x.sh, { ...rg, r2: rg.r1 }, rg);
}

export function fillRight(): void {
  const x = wbSheet();
  if (!x) return;
  const rg = selRange(getState().sel);
  if (rg.c2 === rg.c1) {
    if (rg.c1 === 0) return;
    fillRange(x.wb, x.sh, { ...rg, c1: rg.c1 - 1, c2: rg.c1 - 1 }, { ...rg, c1: rg.c1 - 1 });
  } else fillRange(x.wb, x.sh, { ...rg, c2: rg.c1 }, rg);
}
