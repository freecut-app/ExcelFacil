// Diálogos simples baseados em Promise: confirmar, escolher entre opções, digitar um texto.

import { AlertTriangle, Info, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export interface Choice {
  key: string;
  label: string;
  kind?: 'primary' | 'danger' | 'normal';
}

interface DialogSpec {
  id: number;
  kind: 'choice' | 'prompt';
  title: string;
  message?: React.ReactNode;
  icon?: 'warn' | 'info';
  choices: Choice[];
  cancelKey: string;
  value?: string;
  placeholder?: string;
  validate?: (v: string) => string | null;
  resolve: (r: { key: string; value?: string }) => void;
}

const useDialogs = create<{ stack: DialogSpec[] }>(() => ({ stack: [] }));
let nextId = 1;

function push(spec: Omit<DialogSpec, 'id' | 'resolve'>): Promise<{ key: string; value?: string }> {
  return new Promise((resolve) => {
    const id = nextId++;
    useDialogs.setState((s) => ({
      stack: [
        ...s.stack,
        {
          ...spec,
          id,
          resolve: (r) => {
            useDialogs.setState((x) => ({ stack: x.stack.filter((d) => d.id !== id) }));
            resolve(r);
          },
        },
      ],
    }));
  });
}

export function anyDialogOpen(): boolean {
  return useDialogs.getState().stack.length > 0;
}

export async function confirm(opts: {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  const r = await push({
    kind: 'choice',
    title: opts.title,
    message: opts.message,
    icon: opts.danger ? 'warn' : 'info',
    choices: [
      { key: 'cancel', label: opts.cancelLabel ?? 'Cancelar' },
      { key: 'ok', label: opts.confirmLabel ?? 'Confirmar', kind: opts.danger ? 'danger' : 'primary' },
    ],
    cancelKey: 'cancel',
  });
  return r.key === 'ok';
}

export async function choose(opts: { title: string; message?: React.ReactNode; choices: Choice[]; cancelKey?: string; icon?: 'warn' | 'info' }): Promise<string> {
  const r = await push({ kind: 'choice', title: opts.title, message: opts.message, icon: opts.icon ?? 'info', choices: opts.choices, cancelKey: opts.cancelKey ?? 'cancel' });
  return r.key;
}

export async function alertMsg(title: string, message?: React.ReactNode, icon: 'warn' | 'info' = 'info'): Promise<void> {
  await push({ kind: 'choice', title, message, icon, choices: [{ key: 'ok', label: 'Entendi', kind: 'primary' }], cancelKey: 'ok' });
}

export async function prompt(opts: {
  title: string;
  message?: React.ReactNode;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
}): Promise<string | null> {
  const r = await push({
    kind: 'prompt',
    title: opts.title,
    message: opts.message,
    value: opts.value ?? '',
    placeholder: opts.placeholder,
    validate: opts.validate,
    choices: [
      { key: 'cancel', label: 'Cancelar' },
      { key: 'ok', label: opts.confirmLabel ?? 'OK', kind: 'primary' },
    ],
    cancelKey: 'cancel',
  });
  return r.key === 'ok' ? (r.value ?? '') : null;
}

export function btnClass(kind: Choice['kind'] = 'normal'): string {
  const base = 'min-w-[96px] h-10 px-4 rounded-lg text-[0.95rem] font-medium transition-colors disabled:opacity-50';
  if (kind === 'primary') return `${base} bg-brand-600 text-white hover:bg-brand-700`;
  if (kind === 'danger') return `${base} bg-red-600 text-white hover:bg-red-700`;
  return `${base} bg-white border border-gray-300 text-gray-800 hover:bg-gray-50`;
}

function DialogView({ d }: { d: DialogSpec }) {
  const [value, setValue] = useState(d.value ?? '');
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (d.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else primaryRef.current?.focus();
  }, [d.kind]);

  const submit = (key: string) => {
    if (d.kind === 'prompt' && key !== d.cancelKey && d.validate) {
      const e = d.validate(value);
      if (e) {
        setErr(e);
        return;
      }
    }
    d.resolve({ key, value });
  };

  const primary = [...d.choices].reverse().find((c) => c.kind === 'primary' || c.kind === 'danger') ?? d.choices[d.choices.length - 1];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') submit(d.cancelKey);
        if (e.key === 'Enter' && d.kind === 'prompt') submit(primary.key);
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dlg-${d.id}`}
    >
      <div className="anim-in w-[min(520px,92vw)] rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 px-6 pt-5">
          {d.icon === 'warn' ? (
            <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-500" />
          ) : (
            <Info className="mt-0.5 h-7 w-7 shrink-0 text-brand-600" />
          )}
          <div className="min-w-0 flex-1">
            <h2 id={`dlg-${d.id}`} className="text-lg font-semibold text-gray-900">
              {d.title}
            </h2>
            {d.message && <div className="mt-2 text-[0.95rem] leading-relaxed text-gray-600">{d.message}</div>}
          </div>
          <button title="Fechar" className="rounded p-1 text-gray-400 hover:bg-gray-100" onClick={() => submit(d.cancelKey)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {d.kind === 'prompt' && (
          <div className="px-6 pt-4">
            <input
              ref={inputRef}
              value={value}
              placeholder={d.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setErr(null);
              }}
              className="h-11 w-full rounded-lg border border-gray-300 px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2 rounded-b-2xl bg-gray-50 px-6 py-4">
          {d.choices.map((c) => (
            <button key={c.key} ref={c === primary ? primaryRef : undefined} className={btnClass(c.kind)} onClick={() => submit(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DialogHost() {
  const stack = useDialogs((s) => s.stack);
  const top = stack[stack.length - 1];
  return top ? <DialogView key={top.id} d={top} /> : null;
}
