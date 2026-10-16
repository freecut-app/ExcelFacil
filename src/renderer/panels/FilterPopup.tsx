import { ArrowDownAZ, ArrowUpZA, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { colToLetters, MAX_ROWS } from '../../core/address';
import { distinctValues, setColumnFilter, sortRange } from '../../core/ops';
import { focusGrid } from '../actions/editing';
import { currentSheet, setState, useApp } from '../store';

export function FilterPopup({ col, x, y }: { col: number; x: number; y: number }) {
  const wb = useApp((s) => s.wb)!;
  const sh = currentSheet()!;
  const f = sh.filter!;
  const values = useMemo(() => distinctValues(wb, sh, col), [wb, sh, col]);
  const current = f.allowed[col];
  const [checked, setChecked] = useState<Set<string>>(new Set(current ?? values));
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const shown = values.filter((v) => v.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')));
  const header = wb.value(sh, f.headerRow, col);

  const close = () => {
    setState({ panel: null });
    focusGrid();
  };
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const left = Math.min(x, window.innerWidth - 300);
  const top = Math.min(y, window.innerHeight - 460);
  const sort = (asc: boolean) => {
    sortRange(wb, sh, { r1: f.headerRow, c1: f.c1, r2: MAX_ROWS - 1, c2: f.c2 }, col, asc, true);
    close();
  };

  return (
    <div ref={ref} className="anim-in fixed z-[60] w-[290px] rounded-xl border border-gray-200 bg-white shadow-2xl" style={{ left, top }} data-testid="filter-popup" data-keep-focus onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
        Filtrar “{typeof header === 'string' && header ? header : `Coluna ${colToLetters(col)}`}”
      </div>
      <div className="border-b border-gray-100 py-1">
        <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-50" onClick={() => sort(true)}>
          <ArrowDownAZ className="h-4 w-4" /> Ordenar crescente (A→Z)
        </button>
        <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-50" onClick={() => sort(false)}>
          <ArrowUpZA className="h-4 w-4" /> Ordenar decrescente (Z→A)
        </button>
      </div>
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input autoFocus className="h-9 w-full rounded-lg border border-gray-300 pl-8 pr-2 text-sm outline-none focus:border-brand-500" placeholder="Procurar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="mt-2 max-h-[220px] overflow-y-auto rounded-lg border border-gray-100 p-1">
          <label className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-brand-600"
              checked={shown.every((v) => checked.has(v))}
              onChange={(e) => {
                const n = new Set(checked);
                for (const v of shown) e.target.checked ? n.add(v) : n.delete(v);
                setChecked(n);
              }}
            />
            (Selecionar tudo)
          </label>
          {shown.map((v) => (
            <label key={v} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                className="accent-brand-600"
                checked={checked.has(v)}
                onChange={(e) => {
                  const n = new Set(checked);
                  e.target.checked ? n.add(v) : n.delete(v);
                  setChecked(n);
                }}
                data-testid={`filter-value-${v}`}
              />
              <span className="truncate">{v}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-between gap-2 border-t border-gray-100 px-3 py-2">
        <button className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40" disabled={!current} onClick={() => { setColumnFilter(wb, sh, col, null); close(); }}>
          Limpar filtro
        </button>
        <div className="flex gap-2">
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={close}>
            Cancelar
          </button>
          <button
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            disabled={checked.size === 0}
            data-testid="filter-ok"
            onClick={() => {
              const all = values.every((v) => checked.has(v));
              setColumnFilter(wb, sh, col, all ? null : [...checked]);
              close();
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
