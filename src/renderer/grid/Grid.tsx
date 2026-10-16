// Grade de células virtualizada (canvas). Um <textarea> fica sempre sobre a célula ativa:
// assim a digitação com acentos (teclas mortas do teclado ABNT) e IME funciona normalmente.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MAX_COLS, MAX_ROWS, normRange, parseRangeA1, Range, rangeToA1 } from '../../core/address';
import { fillRange } from '../../core/ops';
import { cycleAbsolute } from '../../core/formula/refs';
import { tokenize } from '../../core/formula/tokenizer';
import {
  autofitColumns,
  cancelEdit,
  clearSelection,
  commitEdit,
  commitToSelection,
  copySelection,
  fillDown,
  fillRight,
  focusGrid,
  moveActive,
  moveWithinSelection,
  pasteSelection,
  selectAll,
  setSel,
  setZoom,
  startEdit,
  toggleFlag,
  undo,
  redo,
  updateEditText,
} from '../actions/editing';
import { openCellMenu } from '../components/CellMenu';
import { findFunc, formulaContext, FuncDoc, matchFuncs } from '../functionsCatalog';
import { getState, selRange, setState, useApp } from '../store';
import { gridBus } from './bus';
import { Axis } from './geometry';
import { colX, computeLayout, draw, DrawParams, filterButtonRect, REF_COLORS, rowY } from './render';

type Drag =
  | { kind: 'select' }
  | { kind: 'cols'; anchor: number }
  | { kind: 'rows'; anchor: number }
  | { kind: 'resizeCol'; col: number; startX: number; startW: number; cols: number[] }
  | { kind: 'resizeRow'; row: number; startY: number; startH: number; rows: number[] }
  | { kind: 'fill'; src: Range }
  | { kind: 'point'; anchor: { r: number; c: number }; base: string; insertAt: number };

const POINTABLE = /[=(;+\-*/^&<>:]\s*$/;

export function Grid() {
  const wb = useApp((s) => s.wb)!;
  const rev = useApp((s) => s.rev);
  const active = useApp((s) => s.active);
  const sel = useApp((s) => s.sel);
  const editing = useApp((s) => s.editing);
  const zoomPct = useApp((s) => s.zoom);
  const clip = useApp((s) => s.clip);
  const z = zoomPct / 100;
  const sheet = wb.sheets[Math.min(active, wb.sheets.length - 1)];

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState({ w: 800, h: 600 });
  const scroll = useRef({ x: 0, y: 0 });
  const [ext, setExt] = useState({ rows: 0, cols: 0 });
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [sizeTick, bumpSize] = useReducer((x: number) => x + 1, 0); // prévia ao redimensionar
  const [fillPreview, setFillPreview] = useState<Range | null>(null);
  const [hint, setHint] = useState<{ list: FuncDoc[]; index: number; open: FuncDoc | null; word: string; wordStart: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const autoScroll = useRef<ReturnType<typeof setInterval> | null>(null);
  const composing = useRef(false);
  const pointBase = useRef<{ base: string; insertAt: number } | null>(null); // modo de apontar referências
  const hintDismissed = useRef<string | null>(null); // texto para o qual a pessoa fechou as sugestões (Esc)

  const used = useMemo(() => sheet.used(), [sheet, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowCount = Math.min(MAX_ROWS, Math.max(1000, used.rows + 200, ext.rows));
  const colCount = Math.min(MAX_COLS, Math.max(30, used.cols + 10, ext.cols));
  const rows = useMemo(() => new Axis(rowCount, (r) => sheet.rowHeight(r) * z), [sheet, rev, z, rowCount, sizeTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = useMemo(() => new Axis(colCount, (c) => sheet.colWidth(c) * z), [sheet, rev, z, colCount, sizeTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const hdrH = Math.round(24 * z);
  const hdrW = Math.round(Math.max(46, String(rowCount).length * 8 + 22) * z);
  const range = selRange(sel);

  // Referências coloridas enquanto se digita uma fórmula
  const refs = useMemo(() => {
    if (!editing || !editing.text.startsWith('=')) return [];
    try {
      const out: { range: Range; color: string }[] = [];
      let i = 0;
      for (const t of tokenize(editing.text.slice(1), 'pt')) {
        if (t.type !== 'ref') continue;
        if (t.sheet != null && t.sheet.toLowerCase() !== sheet.name.toLowerCase()) continue;
        const rg = parseRangeA1(t.ref!.includes(':') && !/\d/.test(t.ref!) ? t.ref!.replace(/^(\$?[A-Za-z]+):(\$?[A-Za-z]+)$/, '$11:$2' + rowCount) : t.ref!);
        if (rg) out.push({ range: rg, color: REF_COLORS[i++ % REF_COLORS.length] });
      }
      return out;
    } catch {
      return [];
    }
  }, [editing, sheet, rowCount]);

  const params = (): DrawParams => ({
    wb,
    sheet,
    rows,
    cols,
    scrollX: scroll.current.x,
    scrollY: scroll.current.y,
    width: view.w,
    height: view.h,
    zoom: z,
    hdrW,
    hdrH,
    sel: range,
    active: { r: sel.ar, c: sel.ac },
    showActive: true,
    clip: clip && clip.sheetUid === sheet.uid ? clip.range : null,
    refs,
    fillPreview,
  });
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const rafId = useRef(0);
  const redraw = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const p = paramsRef.current();
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(p.width * dpr) || cv.height !== Math.round(p.height * dpr)) {
        cv.width = Math.round(p.width * dpr);
        cv.height = Math.round(p.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, p);
    });
  }, []);

  useEffect(redraw);

  // Tamanho da área visível
  useLayoutEffect(() => {
    const sc = scrollerRef.current!;
    const ro = new ResizeObserver(() => setView({ w: sc.clientWidth, h: sc.clientHeight }));
    ro.observe(sc);
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDpr = () => redraw();
    mq.addEventListener('change', onDpr);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', onDpr);
    };
  }, [redraw]);

  const onScroll = () => {
    const sc = scrollerRef.current!;
    scroll.current = { x: sc.scrollLeft, y: sc.scrollTop };
    // Cresce a grade ao chegar perto do fim.
    if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 400 && rowCount < MAX_ROWS) setExt((e) => ({ ...e, rows: Math.min(MAX_ROWS, rowCount + 1000) }));
    if (sc.scrollLeft + sc.clientWidth > sc.scrollWidth - 300 && colCount < MAX_COLS) setExt((e) => ({ ...e, cols: Math.min(MAX_COLS, colCount + 20) }));
    redraw();
    bump();
  };

  // ---------- API para o resto da interface ----------
  useEffect(() => {
    gridBus.redraw = redraw;
    gridBus.ensureVisible = (r, c) => {
      const sc = scrollerRef.current;
      if (!sc) return;
      if (r >= rowCount - 50) setExt((e) => ({ ...e, rows: Math.min(MAX_ROWS, r + 500) }));
      if (c >= colCount - 5) setExt((e) => ({ ...e, cols: Math.min(MAX_COLS, c + 20) }));
      const p = paramsRef.current();
      const frozenH = p.rows.pos(sheet.freezeRows);
      const top = p.rows.pos(Math.min(r, p.rows.count - 1));
      const bottom = top + p.rows.size(Math.min(r, p.rows.count - 1));
      const left = p.cols.pos(Math.min(c, p.cols.count - 1));
      const right = left + p.cols.size(Math.min(c, p.cols.count - 1));
      const viewH = sc.clientHeight - hdrH;
      const viewW = sc.clientWidth - hdrW;
      if (r >= sheet.freezeRows) {
        if (top - frozenH < sc.scrollTop) sc.scrollTop = Math.max(0, top - frozenH);
        else if (bottom > sc.scrollTop + viewH) sc.scrollTop = bottom - viewH;
      }
      if (left < sc.scrollLeft) sc.scrollLeft = left;
      else if (right > sc.scrollLeft + viewW) sc.scrollLeft = Math.min(right - viewW, left);
      // Atualiza já (o evento "scroll" só chega no próximo quadro).
      if (sc.scrollLeft !== scroll.current.x || sc.scrollTop !== scroll.current.y) {
        scroll.current = { x: sc.scrollLeft, y: sc.scrollTop };
        redraw();
      }
    };
    gridBus.resetScroll = () => {
      const sc = scrollerRef.current;
      if (sc) {
        sc.scrollTop = 0;
        sc.scrollLeft = 0;
      }
    };
    gridBus.setEditorText = (text, caret) => {
      const ta = editorRef.current;
      if (ta) {
        ta.value = text;
        const pos = caret ?? text.length;
        ta.setSelectionRange(pos, pos);
      }
      updateEditText(text);
    };
    gridBus.cellScreenRect = (r, c) => {
      const cont = containerRef.current;
      if (!cont) return null;
      const p = paramsRef.current();
      const b = cont.getBoundingClientRect();
      return new DOMRect(b.left + colX(p, c), b.top + rowY(p, r), p.cols.size(c), p.rows.size(r));
    };
  });

  // ---------- editor de célula ----------
  const prevEditing = useRef<typeof editing>(null);
  useEffect(() => {
    const ta = editorRef.current;
    if (!ta) return;
    const was = prevEditing.current;
    prevEditing.current = editing;
    if (!editing) {
      if (!composing.current) ta.value = '';
      setHint(null);
      return;
    }
    const started = !was || was.row !== editing.row || was.col !== editing.col;
    if (started && (editing.mode === 'edit' || editing.source === 'bar')) {
      ta.value = editing.text;
      if (editing.source === 'cell') {
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    } else if (ta.value !== editing.text && document.activeElement !== ta) {
      ta.value = editing.text;
    }
    updateHints();
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foca o editor quando a grade aparece
  useEffect(() => {
    focusGrid();
  }, [active]);

  function updateHints() {
    const ta = editorRef.current;
    const e = getState().editing;
    if (!ta || !e || !e.text.startsWith('=') || hintDismissed.current === e.text) {
      setHint(null);
      return;
    }
    hintDismissed.current = null;
    const caret = e.source === 'cell' ? (ta.selectionStart ?? e.text.length) : e.text.length;
    const ctx = formulaContext(e.text, caret);
    const list = ctx.word.length >= 1 ? matchFuncs(ctx.word) : [];
    const open = ctx.openFunc ? (findFunc(ctx.openFunc) ?? null) : null;
    if (!list.length && !open) setHint(null);
    else setHint({ list, index: 0, open, word: ctx.word, wordStart: ctx.wordStart });
  }

  function acceptHint(f: FuncDoc) {
    const ta = editorRef.current;
    const e = getState().editing;
    if (!ta || !e || !hint) return;
    const caret = ta.selectionStart ?? e.text.length;
    const before = e.text.slice(0, hint.wordStart);
    const after = e.text.slice(caret);
    const insert = f.pt + '(';
    gridBus.setEditorText(before + insert + after, before.length + insert.length);
    setHint(null);
    setTimeout(updateHints, 0);
  }

  const editRect = (() => {
    const r = editing ? editing.row : sel.ar;
    const c = editing ? editing.col : sel.ac;
    const p = paramsRef.current();
    const x = colX(p, c);
    const y = rowY(p, r);
    const w = cols.size(Math.min(c, cols.count - 1));
    const h = rows.size(Math.min(r, rows.count - 1));
    return { x, y, w, h };
  })();

  const editorStyle: React.CSSProperties = (() => {
    const s = sheet.get(editing?.row ?? sel.ar, editing?.col ?? sel.ac)?.s;
    const fs = ((s?.size ?? 11) * 4) / 3 * z;
    const lines = editing ? editing.text.split('\n').length : 1;
    const textW = editing ? Math.max(...editing.text.split('\n').map((l) => l.length)) * fs * 0.6 + 16 : 0;
    const visible = editing && editing.source === 'cell';
    return {
      position: 'absolute',
      left: Math.max(hdrW, editRect.x),
      top: Math.max(hdrH, editRect.y),
      width: Math.max(editRect.w, Math.min(textW, view.w - editRect.x - 4)),
      height: Math.max(editRect.h, lines * fs * 1.3 + 6),
      font: `${s?.i ? 'italic ' : ''}${s?.b ? 'bold ' : ''}${fs}px "${s?.font ?? 'Segoe UI'}", "Segoe UI", sans-serif`,
      lineHeight: `${Math.max(editRect.h, fs * 1.3)}px`,
      zIndex: visible ? 4 : 1,
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      color: s?.color,
      ...(visible && lines > 1 ? { lineHeight: `${fs * 1.3}px`, paddingTop: 3 } : {}),
    };
  })();

  const onEditorInput = () => {
    const ta = editorRef.current!;
    const st = getState();
    if (composing.current && !st.editing) {
      startEdit('enter', '');
      return;
    }
    if (!st.editing) {
      startEdit('enter', ta.value);
      return;
    }
    pointBase.current = null;
    updateEditText(ta.value);
    setTimeout(updateHints, 0);
  };

  // ---------- teclado ----------
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing.current || e.nativeEvent.isComposing) return;
    const st = getState();
    const ed = st.editing;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;

    if (ed) {
      if (hint && hint.list.length) {
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          e.preventDefault();
          setHint({ ...hint, index: (hint.index + (k === 'ArrowDown' ? 1 : -1) + hint.list.length) % hint.list.length });
          return;
        }
        if (k === 'Tab' || (k === 'Enter' && !e.shiftKey && !ctrl && hint.word.length > 0 && !e.altKey)) {
          e.preventDefault();
          acceptHint(hint.list[hint.index]);
          return;
        }
        if (k === 'Escape') {
          e.preventDefault();
          hintDismissed.current = ed.text;
          setHint(null);
          return;
        }
      }
      if (k === 'Enter') {
        e.preventDefault();
        if (e.altKey) {
          const ta = editorRef.current!;
          const p = ta.selectionStart;
          gridBus.setEditorText(ta.value.slice(0, p) + '\n' + ta.value.slice(ta.selectionEnd), p + 1);
          return;
        }
        if (ctrl) commitToSelection();
        else commitEdit(e.shiftKey ? 'up' : 'down');
        return;
      }
      if (k === 'Tab') {
        e.preventDefault();
        commitEdit(e.shiftKey ? 'left' : 'right');
        return;
      }
      if (k === 'Escape') {
        e.preventDefault();
        cancelEdit();
        return;
      }
      if (k === 'F2') {
        e.preventDefault();
        setState({ editing: { ...ed, mode: ed.mode === 'edit' ? 'enter' : 'edit' } });
        return;
      }
      if (k === 'F4') {
        e.preventDefault();
        const ta = editorRef.current!;
        const pos = ta.selectionStart;
        const text = ta.value;
        const re = /\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          if (pos >= m.index && pos <= m.index + m[0].length) {
            const nr = cycleAbsolute(m[0]);
            gridBus.setEditorText(text.slice(0, m.index) + nr + text.slice(m.index + m[0].length), m.index + nr.length);
            break;
          }
        }
        return;
      }
      if (ed.mode === 'enter' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !e.shiftKey) {
        e.preventDefault();
        commitEdit(k === 'ArrowUp' ? 'up' : k === 'ArrowDown' ? 'down' : k === 'ArrowLeft' ? 'left' : 'right');
        return;
      }
      if (ctrl && (k === 'b' || k === 'B' || k === 'i' || k === 'I')) e.preventDefault();
      setTimeout(updateHints, 0);
      return;
    }

    // Sem edição: navegação e atalhos
    const shift = e.shiftKey;
    switch (k) {
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1, 0, shift, ctrl);
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1, 0, shift, ctrl);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveActive(0, -1, shift, ctrl);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveActive(0, 1, shift, ctrl);
        return;
      case 'Enter':
        e.preventDefault();
        moveWithinSelection(shift ? -1 : 1, 0);
        return;
      case 'Tab':
        e.preventDefault();
        moveWithinSelection(0, shift ? -1 : 1);
        return;
      case 'Home':
        e.preventDefault();
        if (ctrl) setSel({ ar: 0, ac: 0, fr: 0, fc: 0 });
        else if (shift) setSel({ ...st.sel, fc: 0 });
        else setSel({ ar: st.sel.ar, ac: 0, fr: st.sel.ar, fc: 0 });
        return;
      case 'End':
        if (ctrl) {
          e.preventDefault();
          const u = sheet.usedData();
          setSel({ ar: Math.max(0, u.rows - 1), ac: Math.max(0, u.cols - 1), fr: Math.max(0, u.rows - 1), fc: Math.max(0, u.cols - 1) });
        }
        return;
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        const n = Math.max(1, Math.floor((view.h - hdrH) / (24 * z)) - 1);
        moveActive(k === 'PageDown' ? n : -n, 0, shift);
        return;
      }
      case 'F2':
        e.preventDefault();
        startEdit('edit');
        return;
      case 'Delete':
        e.preventDefault();
        clearSelection('contents');
        return;
      case 'Backspace':
        e.preventDefault();
        clearSelection('contents');
        startEdit('enter', '');
        return;
      case 'Escape':
        if (st.clip) setState({ clip: null });
        return;
    }
    if (ctrl) {
      const key = k.toLowerCase();
      const handled = (() => {
        switch (key) {
          case 'c':
            void copySelection(false);
            return true;
          case 'x':
            void copySelection(true);
            return true;
          case 'v':
            void pasteSelection(shift ? 'values' : 'all');
            return true;
          case 'z':
            undo();
            return true;
          case 'y':
            redo();
            return true;
          case 'a':
            selectAll();
            return true;
          // Negrito/itálico/sublinhado: Ctrl+B, Ctrl+I, Ctrl+U (Ctrl+N fica para "Nova planilha").
          case 'b':
            toggleFlag('b');
            return true;
          case 'i':
            toggleFlag('i');
            return true;
          case 'u':
            toggleFlag('u');
            return true;
          case 'd':
            fillDown();
            return true;
          case 'r':
            fillRight();
            return true;
          case ';': {
            const d = new Date();
            const t = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            startEdit('enter', t);
            gridBus.setEditorText(t);
            return true;
          }
          case '=':
          case '+':
            setZoom(st.zoom + 10);
            return true;
          case '-':
            setZoom(st.zoom - 10);
            return true;
          case '0':
            setZoom(100);
            return true;
        }
        return false;
      })();
      if (handled) e.preventDefault();
    }
  };

  // ---------- mouse ----------
  function hit(clientX: number, clientY: number) {
    const b = containerRef.current!.getBoundingClientRect();
    const x = clientX - b.left;
    const y = clientY - b.top;
    const p = paramsRef.current();
    const L = computeLayout(p);
    const inColHdr = y < hdrH;
    const inRowHdr = x < hdrW;
    const c = cols.indexAt(x - hdrW + p.scrollX);
    let r: number;
    if (y - hdrH < L.frozenH) r = rows.indexAt(Math.max(0, y - hdrH));
    else r = rows.indexAt(y - hdrH + p.scrollY);
    return { x, y, r, c, inColHdr, inRowHdr, p };
  }

  function edgeCol(x: number, p: DrawParams): number | null {
    // Borda direita da coluna sob o mouse (para redimensionar)
    const c = cols.indexAt(x - hdrW + p.scrollX);
    const right = colX(p, c) + cols.size(c);
    const left = colX(p, c);
    if (Math.abs(x - right) <= 4) return c;
    if (Math.abs(x - left) <= 4 && c > 0) return c - 1;
    return null;
  }

  function edgeRow(y: number, p: DrawParams): number | null {
    const L = computeLayout(p);
    const r = y - hdrH < L.frozenH ? rows.indexAt(y - hdrH) : rows.indexAt(y - hdrH + p.scrollY);
    const top = rowY(p, r);
    const bottom = top + rows.size(r);
    if (Math.abs(y - bottom) <= 3) return r;
    if (Math.abs(y - top) <= 3 && r > 0) {
      let pr = r - 1;
      while (pr > 0 && rows.size(pr) === 0) pr--;
      return pr;
    }
    return null;
  }

  function onFillHandle(x: number, y: number, p: DrawParams): boolean {
    const rg = selRange(getState().sel);
    const rx = colX(p, rg.c2) + cols.size(rg.c2);
    const ry = rowY(p, rg.r2) + rows.size(Math.min(rg.r2, rows.count - 1));
    return Math.abs(x - rx) <= 6 && Math.abs(y - ry) <= 6;
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const sc = scrollerRef.current!;
    const h = hit(e.clientX, e.clientY);
    if (h.x > sc.clientWidth || h.y > sc.clientHeight) return; // barras de rolagem
    const st = getState();
    lastMouse.current = { x: e.clientX, y: e.clientY };

    // Modo de apontar: clicar numa célula enquanto digita uma fórmula insere a referência.
    if (st.editing && !h.inColHdr && !h.inRowHdr && st.editing.text.startsWith('=')) {
      const txt = st.editing.text;
      const caretAtEnd = st.editing.source === 'bar' || (editorRef.current?.selectionStart ?? txt.length) === txt.length;
      const base = pointBase.current?.base ?? txt;
      if (caretAtEnd && (POINTABLE.test(base) || pointBase.current)) {
        e.preventDefault();
        const b = pointBase.current ?? { base: txt, insertAt: txt.length };
        pointBase.current = b;
        const ref = rangeToA1({ r1: h.r, c1: h.c, r2: h.r, c2: h.c });
        const nt = b.base + ref;
        if (st.editing.source === 'bar') updateEditText(nt);
        else gridBus.setEditorText(nt);
        drag.current = { kind: 'point', anchor: { r: h.r, c: h.c }, base: b.base, insertAt: b.insertAt };
        attachDrag();
        return;
      }
    }

    if (st.editing && !commitEdit('none')) return;
    e.preventDefault();
    focusGrid();

    if (h.inColHdr && h.inRowHdr) {
      selectAll();
      return;
    }
    if (h.inColHdr) {
      const ec = edgeCol(h.x, h.p);
      if (ec !== null) {
        if (e.detail === 2) {
          autofitColumns([ec]);
          return;
        }
        const rg = selRange(st.sel);
        const fullCols = rg.r1 === 0 && rg.r2 === MAX_ROWS - 1 && ec >= rg.c1 && ec <= rg.c2;
        const list = fullCols ? Array.from({ length: rg.c2 - rg.c1 + 1 }, (_, i) => rg.c1 + i) : [ec];
        drag.current = { kind: 'resizeCol', col: ec, startX: e.clientX, startW: sheet.colWidth(ec), cols: list };
        attachDrag();
        return;
      }
      if (e.shiftKey) setSel({ ar: 0, ac: st.sel.ac, fr: MAX_ROWS - 1, fc: h.c }, false);
      else setSel({ ar: 0, ac: h.c, fr: MAX_ROWS - 1, fc: h.c }, false);
      drag.current = { kind: 'cols', anchor: e.shiftKey ? st.sel.ac : h.c };
      attachDrag();
      return;
    }
    if (h.inRowHdr) {
      const er = edgeRow(h.y, h.p);
      if (er !== null) {
        if (e.detail === 2) {
          wb.setRowHeight(sheet, [er], null);
          return;
        }
        const rg = selRange(st.sel);
        const fullRows = rg.c1 === 0 && rg.c2 === MAX_COLS - 1 && er >= rg.r1 && er <= rg.r2;
        const list = fullRows ? Array.from({ length: rg.r2 - rg.r1 + 1 }, (_, i) => rg.r1 + i) : [er];
        drag.current = { kind: 'resizeRow', row: er, startY: e.clientY, startH: sheet.rowHeight(er), rows: list };
        attachDrag();
        return;
      }
      if (e.shiftKey) setSel({ ar: st.sel.ar, ac: 0, fr: h.r, fc: MAX_COLS - 1 }, false);
      else setSel({ ar: h.r, ac: 0, fr: h.r, fc: MAX_COLS - 1 }, false);
      drag.current = { kind: 'rows', anchor: e.shiftKey ? st.sel.ar : h.r };
      attachDrag();
      return;
    }
    // Botão de filtro
    const fb = filterButtonRect(h.p, h.c);
    if (fb && sheet.filter && h.r === sheet.filter.headerRow && h.x >= fb.x && h.x <= fb.x + fb.w && h.y >= fb.y && h.y <= fb.y + fb.h) {
      const b = containerRef.current!.getBoundingClientRect();
      setState({ panel: { type: 'filter', col: h.c, x: b.left + fb.x, y: b.top + fb.y + fb.h + 2 } });
      return;
    }
    if (onFillHandle(h.x, h.y, h.p)) {
      drag.current = { kind: 'fill', src: selRange(st.sel) };
      attachDrag();
      return;
    }
    if (e.detail === 2) {
      setSel({ ar: h.r, ac: h.c, fr: h.r, fc: h.c }, false);
      startEdit('edit');
      return;
    }
    if (e.shiftKey) setSel({ ...st.sel, fr: h.r, fc: h.c }, false);
    else setSel({ ar: h.r, ac: h.c, fr: h.r, fc: h.c }, false);
    drag.current = { kind: 'select' };
    attachDrag();
  };

  function applyDrag(clientX: number, clientY: number) {
    const d = drag.current;
    if (!d) return;
    const h = hit(clientX, clientY);
    const st = getState();
    switch (d.kind) {
      case 'select':
        if (st.sel.fr !== h.r || st.sel.fc !== h.c) setState({ sel: { ...st.sel, fr: h.r, fc: h.c } });
        break;
      case 'cols':
        setState({ sel: { ar: 0, ac: d.anchor, fr: MAX_ROWS - 1, fc: h.c } });
        break;
      case 'rows':
        setState({ sel: { ar: d.anchor, ac: 0, fr: h.r, fc: MAX_COLS - 1 } });
        break;
      case 'resizeCol': {
        const w = Math.max(16, d.startW + (clientX - d.startX) / z);
        sheet.colWidths.set(d.col, Math.round(w)); // prévia; gravado no fim com desfazer
        bumpSize();
        break;
      }
      case 'resizeRow': {
        const hh = Math.max(12, d.startH + (clientY - d.startY) / z);
        sheet.rowHeights.set(d.row, Math.round(hh));
        bumpSize();
        break;
      }
      case 'fill': {
        const s = d.src;
        // Estende na direção de maior deslocamento.
        const dr = h.r > s.r2 ? h.r - s.r2 : h.r < s.r1 ? h.r - s.r1 : 0;
        const dc = h.c > s.c2 ? h.c - s.c2 : h.c < s.c1 ? h.c - s.c1 : 0;
        let t: Range | null = null;
        if (Math.abs(dr) >= Math.abs(dc) && dr !== 0) t = dr > 0 ? { ...s, r2: h.r } : { ...s, r1: h.r };
        else if (dc !== 0) t = dc > 0 ? { ...s, c2: h.c } : { ...s, c1: h.c };
        setFillPreview(t);
        break;
      }
      case 'point': {
        const ref = rangeToA1(normRange({ r1: d.anchor.r, c1: d.anchor.c, r2: h.r, c2: h.c }));
        const nt = d.base + ref;
        if (st.editing?.source === 'bar') updateEditText(nt);
        else gridBus.setEditorText(nt);
        break;
      }
    }
  }

  function attachDrag() {
    const move = (ev: MouseEvent) => {
      lastMouse.current = { x: ev.clientX, y: ev.clientY };
      applyDrag(ev.clientX, ev.clientY);
      // Rolagem automática ao arrastar para fora
      const b = scrollerRef.current!.getBoundingClientRect();
      const out = ev.clientY > b.bottom - 10 || ev.clientY < b.top + hdrH || ev.clientX > b.right - 10 || ev.clientX < b.left + hdrW;
      const scrollable = drag.current && drag.current.kind !== 'resizeCol' && drag.current.kind !== 'resizeRow';
      if (out && scrollable && !autoScroll.current) {
        autoScroll.current = setInterval(() => {
          const lm = lastMouse.current;
          const sc = scrollerRef.current;
          if (!lm || !sc) return;
          const bb = sc.getBoundingClientRect();
          if (lm.y > bb.bottom - 10) sc.scrollTop += 24 * z;
          else if (lm.y < bb.top + hdrH) sc.scrollTop -= 24 * z;
          if (lm.x > bb.right - 10) sc.scrollLeft += 60 * z;
          else if (lm.x < bb.left + hdrW) sc.scrollLeft -= 60 * z;
          applyDrag(lm.x, lm.y);
        }, 50) as unknown as ReturnType<typeof setInterval>;
      } else if (!out && autoScroll.current) {
        clearInterval(autoScroll.current);
        autoScroll.current = null;
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (autoScroll.current) clearInterval(autoScroll.current);
      autoScroll.current = null;
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.kind === 'resizeCol') {
        const w = sheet.colWidth(d.col);
        sheet.colWidths.set(d.col, d.startW);
        if (w !== d.startW) wb.setColWidth(sheet, d.cols, w);
      } else if (d.kind === 'resizeRow') {
        const hh = sheet.rowHeight(d.row);
        sheet.rowHeights.set(d.row, d.startH);
        if (hh !== d.startH) wb.setRowHeight(sheet, d.rows, hh);
      } else if (d.kind === 'fill') {
        setFillPreview((fp) => {
          if (fp) {
            fillRange(wb, sheet, d.src, fp);
            const n = normRange(fp);
            setTimeout(() => setSel({ ar: n.r1, ac: n.c1, fr: n.r2, fc: n.c2 }, false), 0);
          }
          return null;
        });
      } else if (d.kind === 'point') {
        // continua editando; o foco volta para onde estava a edição
        const st = getState();
        if (st.editing?.source === 'cell') editorRef.current?.focus({ preventScroll: true });
      } else {
        gridBus.ensureVisible(getState().sel.fr, getState().sel.fc);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  const [cursor, setCursor] = useState('cell');
  const onMouseMoveHover = (e: React.MouseEvent) => {
    if (drag.current) return;
    const h = hit(e.clientX, e.clientY);
    let c = 'cell';
    if (h.inColHdr && !h.inRowHdr) c = edgeCol(h.x, h.p) !== null ? 'col-resize' : 's-resize';
    else if (h.inRowHdr && !h.inColHdr) c = edgeRow(h.y, h.p) !== null ? 'row-resize' : 'e-resize';
    else if (h.inRowHdr && h.inColHdr) c = 'default';
    else if (onFillHandle(h.x, h.y, h.p)) c = 'crosshair';
    else {
      const fb = filterButtonRect(h.p, h.c);
      if (fb && sheet.filter && h.r === sheet.filter.headerRow && h.x >= fb.x && h.x <= fb.x + fb.w) c = 'pointer';
    }
    if (c !== cursor) setCursor(c);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const h = hit(e.clientX, e.clientY);
    const st = getState();
    if (st.editing && !commitEdit('none')) return;
    const rg = selRange(st.sel);
    const inside = h.r >= rg.r1 && h.r <= rg.r2 && h.c >= rg.c1 && h.c <= rg.c2;
    if (h.inColHdr && !h.inRowHdr) {
      if (!(h.c >= rg.c1 && h.c <= rg.c2 && rg.r1 === 0 && rg.r2 === MAX_ROWS - 1)) setSel({ ar: 0, ac: h.c, fr: MAX_ROWS - 1, fc: h.c }, false);
      openCellMenu(e.clientX, e.clientY, 'col');
    } else if (h.inRowHdr && !h.inColHdr) {
      if (!(h.r >= rg.r1 && h.r <= rg.r2 && rg.c1 === 0 && rg.c2 === MAX_COLS - 1)) setSel({ ar: h.r, ac: 0, fr: h.r, fc: MAX_COLS - 1 }, false);
      openCellMenu(e.clientX, e.clientY, 'row');
    } else {
      if (!inside) setSel({ ar: h.r, ac: h.c, fr: h.r, fc: h.c }, false);
      openCellMenu(e.clientX, e.clientY, 'cell');
    }
  };

  // Ctrl + roda do mouse = zoom
  useEffect(() => {
    const sc = scrollerRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(getState().zoom + (e.deltaY < 0 ? 10 : -10));
      }
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);

  const contentW = hdrW + cols.total;
  const contentH = hdrH + rows.total;
  const hintPos = { left: Math.max(hdrW, editRect.x), top: Math.max(hdrH, editRect.y) + Math.max(editRect.h, 20) + 4 };

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-white" data-testid="grid">
      <canvas ref={canvasRef} className="absolute left-0 top-0" style={{ width: view.w, height: view.h }} />
      <div
        ref={scrollerRef}
        className="absolute inset-0 overflow-scroll"
        style={{ cursor }}
        onScroll={onScroll}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMoveHover}
        onContextMenu={onContextMenu}
        data-testid="grid-scroller"
      >
        <div style={{ width: contentW, height: contentH }} />
      </div>
      <textarea
        id="cell-editor"
        ref={editorRef}
        className={`cell-editor ${editing && editing.source === 'cell' ? 'active' : ''}`}
        style={editorStyle}
        spellCheck={false}
        autoComplete="off"
        aria-label="Editor de célula"
        onInput={onEditorInput}
        onKeyDown={onKeyDown}
        onKeyUp={() => getState().editing && updateHints()}
        onClick={() => getState().editing && updateHints()}
        onCompositionStart={() => {
          composing.current = true;
          if (!getState().editing) startEdit('enter', '');
        }}
        onCompositionEnd={() => {
          composing.current = false;
          const ta = editorRef.current!;
          if (getState().editing) updateEditText(ta.value);
        }}
        onBlur={() => setHint(null)}
      />
      {hint && editing && (
        <div className="anim-in absolute z-10 w-[min(420px,80%)] overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-xl" style={hintPos}>
          {hint.list.map((f, i) => (
            <button
              key={f.pt}
              className={`block w-full px-3 py-1.5 text-left ${i === hint.index ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
              onMouseDown={(ev) => {
                ev.preventDefault();
                acceptHint(f);
              }}
            >
              <span className="font-semibold text-brand-800">{f.pt}</span>
              <span className="ml-2 text-gray-500">{f.desc}</span>
            </button>
          ))}
          {hint.open && !hint.list.length && (
            <div className="px-3 py-2">
              <div className="font-mono text-[0.85rem] text-gray-800">
                <b className="text-brand-800">{hint.open.pt}</b>({hint.open.args})
              </div>
              <div className="mt-0.5 text-gray-500">{hint.open.desc}</div>
            </div>
          )}
          {hint.list.length > 0 && <div className="border-t border-gray-100 px-3 py-1 text-xs text-gray-400">Tab ou Enter para escolher • Esc para fechar</div>}
        </div>
      )}
    </div>
  );
}
