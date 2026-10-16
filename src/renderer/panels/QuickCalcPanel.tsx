// Cálculos com um clique: mostra o resultado da seleção e insere numa célula.

import { Divide, ListOrdered, Sigma, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addr, colToLetters, MAX_COLS, MAX_ROWS, parseA1, Range, rangeToA1 } from '../../core/address';
import { formatValue } from '../../core/format';
import { CellStyle } from '../../core/model';
import { selectionStats } from '../../core/ops';
import { focusGrid, setSel } from '../actions/editing';
import { btnClass } from '../dialogs';
import { Check, Modal } from '../components/ui';
import { currentSheet, getState, QuickOp, selRange, setState, toast, useApp } from '../store';

const INFO: Record<Exclude<QuickOp, 'pct'>, { title: string; fn: string; label: string; icon: React.ReactNode }> = {
  sum: { title: 'Somar seleção', fn: 'SOMA', label: 'A soma é', icon: <Sigma className="h-6 w-6" /> },
  avg: { title: 'Calcular média', fn: 'MÉDIA', label: 'A média é', icon: <Divide className="h-6 w-6" /> },
  max: { title: 'Maior valor', fn: 'MÁXIMO', label: 'O maior valor é', icon: <TrendingUp className="h-6 w-6" /> },
  min: { title: 'Menor valor', fn: 'MÍNIMO', label: 'O menor valor é', icon: <TrendingDown className="h-6 w-6" /> },
  count: { title: 'Contar números', fn: 'CONT.NÚM', label: 'Quantidade de números', icon: <ListOrdered className="h-6 w-6" /> },
};

function trimRange(r: Range): Range {
  const sh = currentSheet()!;
  const u = sh.usedData();
  return { r1: r.r1, c1: r.c1, r2: Math.min(r.r2, Math.max(r.r1, u.rows - 1)), c2: Math.min(r.c2, Math.max(r.c1, u.cols - 1)) };
}

function suggestTarget(r: Range): { row: number; col: number } {
  if (r.r1 === r.r2 && r.c2 > r.c1) return { row: r.r1, col: Math.min(MAX_COLS - 1, r.c2 + 1) };
  return { row: Math.min(MAX_ROWS - 1, r.r2 + 1), col: r.c2 };
}

function numberStyleOf(r: Range): CellStyle | undefined {
  const s = getState();
  const sh = currentSheet()!;
  let style: CellStyle | undefined;
  sh.forEachIn(r, (row, col, cell) => {
    if (style || !cell.s?.fmt) return;
    if (typeof s.wb!.value(sh, row, col) === 'number') style = { fmt: cell.s.fmt, ...(cell.s.dec !== undefined ? { dec: cell.s.dec } : {}) };
  });
  return style;
}

export function QuickCalcPanel({ op }: { op: QuickOp }) {
  const wb = useApp((s) => s.wb)!;
  const sel = useApp((s) => s.sel);
  const sh = currentSheet()!;
  const range = useMemo(() => trimRange(selRange(sel)), [sel]);
  const stats = useMemo(() => selectionStats(wb, sh, [range]), [wb, sh, range]);
  const numStyle = useMemo(() => numberStyleOf(range), [range]);
  const sug = suggestTarget(range);
  const [target, setTarget] = useState(addr(sug.row, sug.col));
  const [asFormula, setAsFormula] = useState(true);
  const [pctMode, setPctMode] = useState<'share' | 'of'>('share');
  const [pctValue, setPctValue] = useState('10');
  const close = () => {
    setState({ panel: null });
    focusGrid();
  };

  const tgt = parseA1(target);
  const tgtCell = tgt ? sh.get(tgt.row, tgt.col) : undefined;
  const tgtFilled = !!tgtCell && (tgtCell.v != null || tgtCell.f != null);
  const inside = tgt && tgt.row >= range.r1 && tgt.row <= range.r2 && tgt.col >= range.c1 && tgt.col <= range.c2;
  const ref = rangeToA1(range);

  if (stats.count === 0) {
    return (
      <Modal title={op === 'pct' ? 'Porcentagem' : INFO[op].title} onClose={close} footer={<button className={btnClass('primary')} onClick={close}>Entendi</button>}>
        <p className="text-[1rem] text-gray-700">Não há números na seleção.</p>
        <p className="mt-2 text-gray-600">
          Primeiro <b>selecione as células com números</b>: clique na primeira, segure o botão do mouse e arraste até a última. Depois clique de novo neste botão.
        </p>
      </Modal>
    );
  }

  const insert = (formula: string, value: number, style?: CellStyle) => {
    if (!tgt) return;
    const text = asFormula ? '=' + formula : String(value).replace('.', ',');
    wb.transact('Inserir resultado', () => {
      wb.setInput(sh, tgt.row, tgt.col, text);
      if (style) wb.applyStyle(sh, { r1: tgt.row, c1: tgt.col, r2: tgt.row, c2: tgt.col }, style);
    });
    setSel({ ar: tgt.row, ac: tgt.col, fr: tgt.row, fc: tgt.col });
    toast(`Resultado colocado na célula ${target.toUpperCase()}.`, 'success');
    close();
  };

  if (op === 'pct') {
    const singleCol = range.c1 === range.c2;
    const shareCol = range.c2 + 1;
    const pct = parseFloat(pctValue.replace(',', '.'));
    const ofValue = isFinite(pct) ? (stats.sum * pct) / 100 : null;
    return (
      <Modal
        title="Porcentagem"
        onClose={close}
        testId="quick-panel"
        footer={
          <>
            <button className={btnClass()} onClick={close}>Cancelar</button>
            {pctMode === 'share' ? (
              <button
                className={btnClass('primary')}
                disabled={!singleCol}
                data-testid="quick-insert"
                onClick={() => {
                  const items: number[] = [];
                  const abs = `$${colToLetters(range.c1)}$${range.r1 + 1}:$${colToLetters(range.c2)}$${range.r2 + 1}`;
                  for (let r = range.r1; r <= range.r2; r++) items.push(r);
                  wb.transact('Porcentagem do total', () => {
                    for (const r of items) {
                      if (typeof wb.value(sh, r, range.c1) !== 'number') continue;
                      wb.setInput(sh, r, shareCol, `=${addr(r, range.c1)}/SOMA(${abs})`);
                    }
                    wb.applyStyle(sh, { r1: range.r1, c1: shareCol, r2: range.r2, c2: shareCol }, { fmt: 'percent', dec: 1 });
                  });
                  setSel({ ar: range.r1, ac: shareCol, fr: range.r2, fc: shareCol });
                  toast('Porcentagens colocadas na coluna ao lado.', 'success');
                  close();
                }}
              >
                Mostrar na coluna ao lado
              </button>
            ) : (
              <button className={btnClass('primary')} disabled={!tgt || ofValue === null || !!inside} onClick={() => insert(`SOMA(${ref})*${String(pct).replace('.', ',')}%`, ofValue!, numStyle)}>
                Inserir em {target.toUpperCase()}
              </button>
            )}
          </>
        }
      >
        <div className="mb-4 flex gap-2">
          <button className={`flex-1 rounded-lg border px-3 py-2 text-sm ${pctMode === 'share' ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-gray-200'}`} onClick={() => setPctMode('share')}>
            Quanto cada valor representa do total
          </button>
          <button className={`flex-1 rounded-lg border px-3 py-2 text-sm ${pctMode === 'of' ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-gray-200'}`} onClick={() => setPctMode('of')}>
            Calcular X% de um valor
          </button>
        </div>
        {pctMode === 'share' ? (
          singleCol ? (
            <p className="text-gray-700">
              Para cada número de <b>{ref}</b>, a coluna ao lado vai mostrar quanto ele representa do total ({formatValue(stats.sum, numStyle)}). As porcentagens se atualizam sozinhas.
            </p>
          ) : (
            <p className="text-amber-800">Selecione só uma coluna de números para usar esta opção.</p>
          )
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-gray-700">
              Quanto é
              <input className="h-10 w-24 rounded-lg border border-gray-300 px-2 text-right" value={pctValue} onChange={(e) => setPctValue(e.target.value)} aria-label="Porcentagem" />% de {formatValue(stats.sum, numStyle)}
              {stats.count > 1 ? ' (soma da seleção)' : ''}?
            </label>
            <div className="rounded-xl bg-brand-50 p-4 text-center">
              <div className="text-sm text-brand-800">Resultado</div>
              <div className="text-[2rem] font-bold text-brand-900">{ofValue === null ? '—' : formatValue(ofValue, numStyle)}</div>
            </div>
            <TargetField target={target} setTarget={setTarget} filled={tgtFilled} inside={!!inside} asFormula={asFormula} setAsFormula={setAsFormula} />
          </div>
        )}
      </Modal>
    );
  }

  const info = INFO[op];
  const value = op === 'sum' ? stats.sum : op === 'avg' ? stats.avg! : op === 'max' ? stats.max! : op === 'min' ? stats.min! : stats.count;
  const style = op === 'count' ? undefined : numStyle;
  return (
    <Modal
      title={info.title}
      onClose={close}
      testId="quick-panel"
      footer={
        <>
          <button className={btnClass()} onClick={close}>Fechar</button>
          <button
            className={btnClass()}
            onClick={() => {
              void window.api.clipboardWrite(formatValue(value, style));
              toast('Resultado copiado.', 'success');
            }}
          >
            Copiar resultado
          </button>
          <button className={btnClass('primary')} disabled={!tgt || !!inside} onClick={() => insert(`${info.fn}(${ref})`, value, style)} data-testid="quick-insert">
            Inserir em {tgt ? target.toUpperCase() : '…'}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-4 rounded-2xl bg-brand-50 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">{info.icon}</span>
        <div>
          <div className="text-sm text-brand-800">
            {info.label} ({stats.count} número{stats.count > 1 ? 's' : ''} em {ref})
          </div>
          <div className="text-[2.1rem] font-bold leading-tight text-brand-900" data-testid="quick-result">
            {formatValue(value, style)}
          </div>
        </div>
      </div>
      {stats.countA > stats.count && <p className="mt-2 text-sm text-gray-500">Células com texto foram ignoradas.</p>}
      <div className="mt-4">
        <TargetField target={target} setTarget={setTarget} filled={tgtFilled} inside={!!inside} asFormula={asFormula} setAsFormula={setAsFormula} />
      </div>
    </Modal>
  );
}

function TargetField(p: { target: string; setTarget: (s: string) => void; filled: boolean; inside: boolean; asFormula: boolean; setAsFormula: (b: boolean) => void }) {
  const valid = !!parseA1(p.target);
  return (
    <div>
      <label className="flex items-center gap-2 text-gray-700">
        Colocar o resultado na célula
        <input
          className={`h-10 w-24 rounded-lg border px-2 text-center font-medium uppercase ${valid ? 'border-gray-300' : 'border-red-400'}`}
          value={p.target}
          onChange={(e) => p.setTarget(e.target.value.trim())}
          aria-label="Célula de destino"
          data-testid="quick-target"
        />
      </label>
      {!valid && <p className="mt-1 text-sm text-red-600">Digite um endereço como B12.</p>}
      {p.inside && <p className="mt-1 text-sm text-red-600">Escolha uma célula fora da seleção.</p>}
      {valid && p.filled && !p.inside && <p className="mt-1 text-sm text-amber-700">Atenção: essa célula já tem conteúdo, que será substituído.</p>}
      <div className="mt-2">
        <Check checked={p.asFormula} onChange={p.setAsFormula} label="Atualizar sozinho quando os números mudarem (insere uma fórmula)" />
      </div>
    </div>
  );
}
