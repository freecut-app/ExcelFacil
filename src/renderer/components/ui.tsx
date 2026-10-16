// Componentes visuais reutilizáveis.

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function RibbonButton(props: {
  icon: React.ReactNode;
  label: string;
  tip?: string;
  onClick?: () => void;
  big?: boolean;
  active?: boolean;
  disabled?: boolean;
  tour?: string;
  testId?: string;
  dropdown?: boolean;
}) {
  const { icon, label, tip, onClick, big, active, disabled, tour, testId, dropdown } = props;
  return (
    <button
      type="button"
      title={tip ?? label}
      aria-label={label}
      aria-pressed={active}
      data-tour={tour}
      data-testid={testId}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault() /* mantém o foco na planilha */}
      onClick={onClick}
      className={
        big
          ? `flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[0.78rem] leading-tight text-gray-700 transition-colors hover:bg-brand-50 disabled:opacity-40 ${active ? 'bg-brand-100 text-brand-800' : ''}`
          : `flex h-8 items-center gap-1.5 rounded-md px-2 text-[0.82rem] text-gray-700 transition-colors hover:bg-brand-50 disabled:opacity-40 ${active ? 'bg-brand-100 text-brand-800 ring-1 ring-brand-300' : ''}`
      }
    >
      <span className={big ? 'flex h-7 w-7 items-center justify-center text-brand-700' : 'flex h-5 w-5 items-center justify-center text-gray-700'}>{icon}</span>
      {(big || label) && <span className={big ? 'max-w-[86px] text-center' : 'whitespace-nowrap'}>{label}</span>}
      {dropdown && <ChevronDown className="h-3 w-3 text-gray-400" />}
    </button>
  );
}

export function IconButton(props: { icon: React.ReactNode; tip: string; onClick?: () => void; active?: boolean; disabled?: boolean; testId?: string; tour?: string }) {
  return (
    <button
      type="button"
      title={props.tip}
      aria-label={props.tip}
      aria-pressed={props.active}
      data-testid={props.testId}
      data-tour={props.tour}
      disabled={props.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-brand-50 disabled:opacity-40 ${props.active ? 'bg-brand-100 text-brand-800 ring-1 ring-brand-300' : ''}`}
    >
      {props.icon}
    </button>
  );
}

export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full shrink-0 flex-col border-r border-gray-200 px-2 last:border-r-0">
      <div className="flex flex-1 items-center gap-0.5">{children}</div>
      <div className="pb-0.5 text-center text-[0.68rem] tracking-wide text-gray-400">{label}</div>
    </div>
  );
}

/** Botão que abre um painel suspenso. */
export function Dropdown(props: { button: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {props.button(open, () => setOpen((o) => !o))}
      {open && (
        <div className={`anim-in absolute top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-xl ${props.align === 'right' ? 'right-0' : 'left-0'}`}>
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const PALETTE = [
  ['#000000', '#404040', '#7f7f7f', '#bfbfbf', '#d9d9d9', '#ffffff'],
  ['#065f46', '#047857', '#10b981', '#6ee7b7', '#d1fae5', '#ecfdf5'],
  ['#1e3a8a', '#1d4ed8', '#3b82f6', '#93c5fd', '#dbeafe', '#eff6ff'],
  ['#7f1d1d', '#b91c1c', '#ef4444', '#fca5a5', '#fee2e2', '#fef2f2'],
  ['#78350f', '#b45309', '#f59e0b', '#fcd34d', '#fef3c7', '#fffbeb'],
  ['#581c87', '#7e22ce', '#a855f7', '#d8b4fe', '#f3e8ff', '#faf5ff'],
  ['#831843', '#be185d', '#ec4899', '#f9a8d4', '#fce7f3', '#fdf2f8'],
  ['#7c2d12', '#c2410c', '#f97316', '#fdba74', '#ffedd5', '#fff7ed'],
];

export function ColorGrid({ onPick, noneLabel }: { onPick: (c: string | undefined) => void; noneLabel: string }) {
  return (
    <div className="w-[236px] p-3">
      <button className="mb-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => onPick(undefined)}>
        {noneLabel}
      </button>
      <div className="grid grid-cols-8 gap-1">
        {PALETTE[0].map((_, row) =>
          PALETTE.map((col) => (
            <button
              key={col[row]}
              title={col[row]}
              aria-label={`Cor ${col[row]}`}
              className="h-6 w-6 rounded border border-gray-200 hover:scale-110"
              style={{ background: col[row] }}
              onClick={() => onPick(col[row])}
            />
          )),
        )}
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-md px-1 text-sm text-gray-600 hover:bg-gray-50">
        Outra cor…
        <input type="color" className="h-7 w-10 cursor-pointer border-0 bg-transparent" onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

export function Modal(props: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: string; testId?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`anim-in flex max-h-[92vh] flex-col rounded-2xl bg-white shadow-2xl ${props.width ?? 'w-[min(560px,94vw)]'}`} role="dialog" aria-modal="true" aria-label={props.title} data-testid={props.testId}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{props.title}</h2>
          <button className="rounded-md px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100" onClick={props.onClose} aria-label="Fechar" title="Fechar">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{props.children}</div>
        {props.footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-3">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[0.95rem] text-gray-700">
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
