import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addr } from '../../core/address';
import { FindHit, findAll, replaceAll } from '../../core/ops';
import { focusGrid, setSel } from '../actions/editing';
import { confirm } from '../dialogs';
import { Check } from '../components/ui';
import { currentSheet, getState, setState, toast, useApp } from '../store';

/** Painel flutuante de localizar/substituir (não bloqueia a planilha). */
export function FindPanel({ replace }: { replace: boolean }) {
  const wb = useApp((s) => s.wb)!;
  const rev = useApp((s) => s.rev);
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [showReplace, setShowReplace] = useState(replace);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [allSheets, setAllSheets] = useState(false);
  const [hits, setHits] = useState<FindHit[]>([]);
  const [idx, setIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setShowReplace(replace), [replace]);

  useEffect(() => {
    const sh = currentSheet();
    if (!sh || !q) {
      setHits([]);
      setIdx(-1);
      return;
    }
    setHits(findAll(wb, sh, q, { matchCase, wholeCell, allSheets }));
    setIdx(-1);
  }, [q, matchCase, wholeCell, allSheets, wb, rev]);

  const go = (i: number) => {
    if (!hits.length) return;
    const n = (i + hits.length) % hits.length;
    setIdx(n);
    const h = hits[n];
    const sIdx = wb.sheets.indexOf(h.sheet);
    if (sIdx !== getState().active) setState({ active: sIdx });
    setTimeout(() => setSel({ ar: h.row, ac: h.col, fr: h.row, fc: h.col }), 0);
  };

  const close = () => {
    setState({ panel: null });
    focusGrid();
  };

  return (
    <div className="anim-in fixed right-4 top-[176px] z-[60] w-[380px] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl" data-testid="find-panel" data-keep-focus onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
          <Search className="h-5 w-5 text-brand-600" /> {showReplace ? 'Localizar e substituir' : 'Localizar'}
        </h3>
        <button className="rounded p-1 text-gray-400 hover:bg-gray-100" onClick={close} aria-label="Fechar" title="Fechar (Esc)">
          <X className="h-5 w-5" />
        </button>
      </div>
      <input
        ref={inputRef}
        className="h-10 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-brand-500"
        placeholder="O que você procura?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go(e.shiftKey ? idx - 1 : idx + 1);
        }}
        data-testid="find-input"
      />
      {showReplace && (
        <input
          className="mt-2 h-10 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-brand-500"
          placeholder="Trocar por…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          data-testid="replace-input"
        />
      )}
      <div className="mt-2 grid grid-cols-2 text-sm">
        <Check checked={matchCase} onChange={setMatchCase} label="Diferenciar maiúsculas" />
        <Check checked={wholeCell} onChange={setWholeCell} label="Célula inteira" />
        <Check checked={allSheets} onChange={setAllSheets} label="Todas as abas" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 text-sm text-gray-500" data-testid="find-count">
          {q ? (hits.length ? `${idx >= 0 ? idx + 1 + ' de ' : ''}${hits.length} encontrado(s)` : 'Nada encontrado') : ''}
          {idx >= 0 && hits[idx] ? ` • ${allSheets ? hits[idx].sheet.name + '!' : ''}${addr(hits[idx].row, hits[idx].col)}` : ''}
        </span>
        <button className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50 disabled:opacity-40" disabled={!hits.length} onClick={() => go(idx - 1)} title="Anterior" aria-label="Anterior">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40" disabled={!hits.length} onClick={() => go(idx + 1)} data-testid="find-next">
          <span className="flex items-center gap-1">
            Próximo <ChevronDown className="h-4 w-4" />
          </span>
        </button>
      </div>
      {showReplace ? (
        <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
            disabled={idx < 0}
            onClick={() => {
              const sh = currentSheet()!;
              const n = replaceAll(wb, sh, q, r, { matchCase, wholeCell }, [hits[idx]]);
              if (!n) toast('Esta célula tem uma fórmula; fórmulas não são alteradas pelo Substituir.', 'info');
            }}
          >
            Substituir este
          </button>
          <button
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            disabled={!hits.length}
            data-testid="replace-all"
            onClick={async () => {
              if (!(await confirm({ title: 'Substituir tudo?', message: `Trocar "${q}" por "${r}" em ${hits.length} célula(s). Você pode desfazer com Ctrl+Z.`, confirmLabel: 'Substituir tudo' }))) return;
              const n = replaceAll(wb, currentSheet()!, q, r, { matchCase, wholeCell }, hits);
              toast(`${n} célula(s) alterada(s).`, 'success');
            }}
          >
            Substituir tudo
          </button>
        </div>
      ) : (
        <button className="mt-3 text-sm text-brand-700 hover:underline" onClick={() => setShowReplace(true)}>
          Quero trocar por outro texto…
        </button>
      )}
    </div>
  );
}
