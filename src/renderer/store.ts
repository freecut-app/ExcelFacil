// Estado global da interface (Zustand). A pasta de trabalho (Workbook) é um objeto
// mutável fora do React; `rev` muda a cada alteração para redesenhar o que for preciso.

import { create } from 'zustand';
import { normRange, Range } from '../core/address';
import { ClipData } from '../core/ops';
import { Workbook } from '../core/workbook';
import { DEFAULT_SETTINGS, Settings } from '../shared/api';

export interface Sel {
  ar: number; // âncora (célula ativa)
  ac: number;
  fr: number; // outra ponta da seleção
  fc: number;
}

export function selRange(s: Sel): Range {
  return normRange({ r1: s.ar, c1: s.ac, r2: s.fr, c2: s.fc });
}

export function cellSel(r: number, c: number): Sel {
  return { ar: r, ac: c, fr: r, fc: c };
}

export interface Editing {
  row: number;
  col: number;
  text: string;
  mode: 'enter' | 'edit'; // enter: começou digitando (setas confirmam); edit: F2/duplo clique
  source: 'cell' | 'bar';
  original: string;
}

export interface DocMeta {
  docId: string;
  filePath: string | null;
  fileName: string; // nome exibido
  kind: 'new' | 'xlsx' | 'csv';
  needsSaveAs: boolean; // CSV ou arquivo com recursos não suportados
  warnings: string[];
  overwriteConfirmed: boolean; // a pessoa já autorizou salvar por cima do arquivo aberto
  savedRev: number;
  lastSavedAt: number | null;
  recoveryAt: number | null;
  saving: boolean;
  saveError: string | null;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export type Panel =
  | { type: 'find'; replace: boolean }
  | { type: 'print'; mode: 'print' | 'pdf' }
  | { type: 'chart' }
  | { type: 'table' }
  | { type: 'functions' }
  | { type: 'settings' }
  | { type: 'dedupe' }
  | { type: 'warnings' }
  | { type: 'quick'; op: QuickOp }
  | { type: 'filter'; col: number; x: number; y: number }
  | null;

export type QuickOp = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'pct';

export interface AppState {
  screen: 'home' | 'editor';
  wb: Workbook | null;
  rev: number;
  meta: DocMeta;
  active: number;
  sel: Sel;
  selBySheet: Record<number, Sel>;
  editing: Editing | null;
  zoom: number;
  clip: ClipData | null;
  ribbonTab: 'inicio' | 'inserir' | 'calculos' | 'dados' | 'exibir';
  fileMenu: boolean;
  helpOpen: boolean;
  panel: Panel;
  settings: Settings;
  toasts: Toast[];
  busy: string | null; // mensagem de carregamento
  formulaError: string | null;
}

export const emptyMeta = (): DocMeta => ({
  docId: '',
  filePath: null,
  fileName: 'Nova planilha',
  kind: 'new',
  needsSaveAs: false,
  warnings: [],
  overwriteConfirmed: false,
  savedRev: 0,
  lastSavedAt: null,
  recoveryAt: null,
  saving: false,
  saveError: null,
});

export const useApp = create<AppState>(() => ({
  screen: 'home',
  wb: null,
  rev: 0,
  meta: emptyMeta(),
  active: 0,
  sel: cellSel(0, 0),
  selBySheet: {},
  editing: null,
  zoom: 100,
  clip: null,
  ribbonTab: 'inicio',
  fileMenu: false,
  helpOpen: false,
  panel: null,
  settings: DEFAULT_SETTINGS,
  toasts: [],
  busy: null,
  formulaError: null,
}));

export const getState = useApp.getState;
export const setState = useApp.setState;

export function currentSheet() {
  const { wb, active } = getState();
  if (!wb) return null;
  return wb.sheets[Math.min(active, wb.sheets.length - 1)] ?? null;
}

export function isDirty(s: AppState = getState()): boolean {
  return !!s.wb && s.rev !== s.meta.savedRev;
}

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3500): void {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
