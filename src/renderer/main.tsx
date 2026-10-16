import { createRoot } from 'react-dom/client';
import { parseA1 } from '../core/address';
import { formatValue } from '../core/format';
import { writeRecovery } from './actions/document';
import { App } from './App';
import { gridBus } from './grid/bus';
import { currentSheet, getState } from './store';
import './index.css';

// Ganchos usados só pelos testes automáticos (nunca no uso normal).
if (window.api?.isTest) {
  (window as unknown as Record<string, unknown>).__ef = {
    state: () => getState(),
    value: (a1: string, sheet?: number) => {
      const s = getState();
      const sh = sheet === undefined ? currentSheet() : s.wb?.sheets[sheet];
      const p = parseA1(a1);
      if (!s.wb || !sh || !p) return undefined;
      return s.wb.value(sh, p.row, p.col);
    },
    shown: (a1: string) => {
      const s = getState();
      const sh = currentSheet();
      const p = parseA1(a1);
      if (!s.wb || !sh || !p) return undefined;
      return formatValue(s.wb.value(sh, p.row, p.col), sh.get(p.row, p.col)?.s);
    },
    edit: (a1: string) => {
      const s = getState();
      const sh = currentSheet();
      const p = parseA1(a1);
      return s.wb && sh && p ? s.wb.editText(sh, p.row, p.col) : undefined;
    },
    style: (a1: string) => {
      const p = parseA1(a1);
      return p ? currentSheet()?.get(p.row, p.col)?.s : undefined;
    },
    cellRect: (a1: string) => {
      const p = parseA1(a1);
      if (!p) return null;
      gridBus.ensureVisible(p.row, p.col);
      const r = gridBus.cellScreenRect(p.row, p.col);
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    writeRecovery: () => writeRecovery(true),
    sheetNames: () => getState().wb?.sheets.map((s) => s.name),
    hidden: () => [...(currentSheet()?.hiddenRows ?? [])],
  };
}

createRoot(document.getElementById('root')!).render(<App />);
