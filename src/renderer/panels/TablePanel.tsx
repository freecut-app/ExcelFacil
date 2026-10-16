// "Inserir tabela": formata a região com cabeçalho, listras e filtro.

import { useMemo, useState } from 'react';
import { rangeToA1 } from '../../core/address';
import { enableFilter } from '../../core/ops';
import { focusGrid, selectionOrRegion, setSel } from '../actions/editing';
import { btnClass } from '../dialogs';
import { Check, Modal } from '../components/ui';
import { currentSheet, setState, toast, useApp } from '../store';

const THEMES = [
  { id: 'verde', name: 'Verde', head: '#047857', band: '#ecfdf5' },
  { id: 'azul', name: 'Azul', head: '#1d4ed8', band: '#eff6ff' },
  { id: 'laranja', name: 'Laranja', head: '#c2410c', band: '#fff7ed' },
  { id: 'roxo', name: 'Roxo', head: '#7e22ce', band: '#faf5ff' },
  { id: 'cinza', name: 'Cinza', head: '#374151', band: '#f3f4f6' },
];

export function TablePanel() {
  const wb = useApp((s) => s.wb)!;
  const sh = currentSheet()!;
  const region = useMemo(() => selectionOrRegion(), []);
  const [theme, setTheme] = useState(THEMES[0]);
  const [header, setHeader] = useState(true);
  const [filter, setFilter] = useState(true);
  const [freeze, setFreeze] = useState(region.r1 === 0);
  const empty = region.r1 === region.r2 && region.c1 === region.c2 && !sh.get(region.r1, region.c1);
  const close = () => {
    setState({ panel: null });
    focusGrid();
  };
  const apply = () => {
    wb.transact('Inserir tabela', () => {
      wb.applyStyle(sh, region, (s, r) => {
        const n = { ...s, bt: true, bb: true, bl: true, br: true };
        if (header && r === region.r1) return { ...n, b: true, fill: theme.head, color: '#ffffff' };
        const i = r - region.r1 - (header ? 1 : 0);
        if (i % 2 === 1) n.fill = theme.band;
        else delete n.fill;
        return n;
      });
      if (filter && header) enableFilter(wb, sh, region);
      if (freeze && header && region.r1 === 0) wb.setFreezeRows(sh, 1);
    });
    setSel({ ar: region.r1, ac: region.c1, fr: region.r2, fc: region.c2 });
    toast('Tabela criada.', 'success');
    close();
  };
  return (
    <Modal
      title="Criar tabela"
      onClose={close}
      testId="table-panel"
      footer={
        <>
          <button className={btnClass()} onClick={close}>Cancelar</button>
          <button className={btnClass('primary')} disabled={empty} onClick={apply} data-testid="table-ok">
            Criar tabela
          </button>
        </>
      }
    >
      {empty ? (
        <p className="text-gray-700">Primeiro digite os dados (com os títulos na primeira linha), selecione-os e clique em <b>Tabela</b> de novo.</p>
      ) : (
        <>
          <p className="text-gray-700">
            Dados da tabela: <b>{rangeToA1(region)}</b>
          </p>
          <div className="mt-3 font-medium text-gray-800">Cor</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button key={t.id} onClick={() => setTheme(t)} className={`overflow-hidden rounded-lg border-2 ${theme.id === t.id ? 'border-gray-800' : 'border-transparent'}`} title={t.name}>
                <div className="h-4 w-16" style={{ background: t.head }} />
                <div className="h-3 w-16 bg-white" />
                <div className="h-3 w-16" style={{ background: t.band }} />
                <div className="h-3 w-16 bg-white" />
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Check checked={header} onChange={setHeader} label="A primeira linha tem os títulos (cabeçalho)" />
            <Check checked={filter} onChange={setFilter} label="Colocar botões de filtro no cabeçalho" />
            {region.r1 === 0 && <Check checked={freeze} onChange={setFreeze} label="Deixar o cabeçalho sempre visível ao rolar" />}
          </div>
        </>
      )}
    </Modal>
  );
}
