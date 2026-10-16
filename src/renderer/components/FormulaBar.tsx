import { AlertCircle, Check, FunctionSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { colToLetters, MAX_COLS, MAX_ROWS, parseRangeA1, rangeToA1 } from '../../core/address';
import { errorExplanation } from '../../core/format';
import { isError } from '../../core/model';
import { cancelEdit, commitAsText, commitEdit, focusGrid, setSel, startEdit, updateEditText } from '../actions/editing';
import { gridBus } from '../grid/bus';
import { currentSheet, getState, selRange, setState, useApp } from '../store';

function NameBox() {
  const sel = useApp((s) => s.sel);
  const rg = selRange(sel);
  const fullCols = rg.r1 === 0 && rg.r2 === MAX_ROWS - 1;
  const fullRows = rg.c1 === 0 && rg.c2 === MAX_COLS - 1;
  let label: string;
  if (fullCols && fullRows) label = 'Tudo';
  else if (fullCols) label = `${colToLetters(rg.c1)}:${colToLetters(rg.c2)}`;
  else if (fullRows) label = `${rg.r1 + 1}:${rg.r2 + 1}`;
  else label = rangeToA1(rg);
  const [text, setText] = useState(label);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(label);
  }, [label, focused]);
  return (
    <input
      className="h-8 w-[96px] shrink-0 rounded-md border border-gray-300 px-2 text-center text-[0.88rem] font-medium uppercase text-gray-700 outline-none focus:border-brand-500"
      value={text}
      title="Endereço da célula. Digite um endereço (ex.: B5) e aperte Enter para ir até ele."
      aria-label="Endereço da célula"
      data-testid="name-box"
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const r = parseRangeA1(text.replace(/\s/g, ''));
          if (r) {
            setSel({ ar: r.r1, ac: r.c1, fr: r.r2, fc: r.c2 });
            focusGrid();
          } else setText(label);
        } else if (e.key === 'Escape') {
          setText(label);
          focusGrid();
        }
      }}
    />
  );
}

export function FormulaBar() {
  const sel = useApp((s) => s.sel);
  const editing = useApp((s) => s.editing);
  const rev = useApp((s) => s.rev);
  const active = useApp((s) => s.active);
  const formulaError = useApp((s) => s.formulaError);
  const inputRef = useRef<HTMLInputElement>(null);
  const wb = useApp((s) => s.wb);
  const sh = currentSheet();
  void rev;
  void active;
  const shown = editing ? editing.text : wb && sh ? wb.editText(sh, sel.ar, sel.ac) : '';
  const v = wb && sh ? wb.value(sh, sel.ar, sel.ac) : null;
  const err = !editing && isError(v) ? v.err : null;

  return (
    <div className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <NameBox />
        <div className="flex shrink-0 items-center gap-0.5 text-gray-500">
          <button title="Cancelar (Esc)" aria-label="Cancelar" disabled={!editing} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit}>
            <X className="h-4 w-4" />
          </button>
          <button title="Confirmar (Enter)" aria-label="Confirmar" disabled={!editing} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" onMouseDown={(e) => e.preventDefault()} onClick={() => commitEdit('none')}>
            <Check className="h-4 w-4" />
          </button>
          <button
            title="Inserir função"
            aria-label="Inserir função"
            className="rounded p-1 text-brand-700 hover:bg-brand-50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setState({ panel: { type: 'functions' } })}
          >
            <FunctionSquare className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={inputRef}
          className="h-8 min-w-0 flex-1 rounded-md border border-gray-300 px-2 font-mono text-[0.9rem] text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          value={shown}
          spellCheck={false}
          placeholder="Digite aqui o conteúdo da célula ou uma fórmula começando com ="
          aria-label="Barra de fórmulas"
          data-testid="formula-bar"
          title="Barra de fórmulas: mostra o conteúdo real da célula (a fórmula, se houver)"
          onFocus={() => {
            const st = getState();
            if (!st.editing) startEdit('edit', undefined, 'bar');
            else if (st.editing.source !== 'bar') setState({ editing: { ...st.editing, source: 'bar' } });
          }}
          onChange={(e) => {
            if (!getState().editing) startEdit('edit', e.target.value, 'bar');
            else updateEditText(e.target.value);
            gridBus.redraw();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (commitEdit('down')) inputRef.current?.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
              inputRef.current?.blur();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              if (commitEdit('right')) inputRef.current?.blur();
            }
          }}
        />
      </div>
      {formulaError && (
        <div className="anim-in mx-2 mb-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[0.88rem] text-red-800" role="alert" data-testid="formula-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <b>Há um problema na fórmula:</b> {formulaError}
          </span>
          <button className="rounded-md bg-white px-3 py-1 text-red-800 ring-1 ring-red-200 hover:bg-red-100" onClick={() => {
            setState({ formulaError: null });
            document.getElementById('cell-editor')?.focus();
          }}>
            Corrigir
          </button>
          <button className="rounded-md bg-white px-3 py-1 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100" onClick={commitAsText}>
            Guardar como texto
          </button>
          <button className="rounded-md px-2 py-1 text-gray-600 hover:bg-red-100" onClick={cancelEdit}>
            Desistir
          </button>
        </div>
      )}
      {err && (
        <div className="mx-2 mb-1.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.85rem] text-amber-900" data-testid="cell-error-help">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorExplanation(err)}
        </div>
      )}
    </div>
  );
}
