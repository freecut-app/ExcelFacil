import { FileDown, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { rangeToA1 } from '../../core/address';
import { buildPrintHtml, printArea } from '../../core/io/print';
import { focusGrid } from '../actions/editing';
import { alertMsg, btnClass } from '../dialogs';
import { Check, Modal } from '../components/ui';
import { currentSheet, getState, selRange, setState, toast, useApp } from '../store';

export function PrintPanel({ mode }: { mode: 'print' | 'pdf' }) {
  const wb = useApp((s) => s.wb)!;
  const sel = useApp((s) => s.sel);
  const fileName = useApp((s) => s.meta.fileName);
  const sh = currentSheet()!;
  const [landscape, setLandscape] = useState(() => {
    const a = printArea(sh);
    if (!a) return false;
    let w = 0;
    for (let c = a.c1; c <= a.c2; c++) w += sh.colWidth(c);
    return w > 760;
  });
  const [grid, setGrid] = useState(true);
  const [fit, setFit] = useState(true);
  const [title, setTitle] = useState(true);
  const rg = selRange(sel);
  const hasSel = !(rg.r1 === rg.r2 && rg.c1 === rg.c2);
  const [onlySel, setOnlySel] = useState(false);
  const [busy, setBusy] = useState(false);
  const docTitle = `${fileName.replace(/\.xlsx$/i, '')} — ${sh.name}`;

  const html = useMemo(() => {
    const u = sh.usedData();
    const range = onlySel && hasSel ? { ...rg, r2: Math.min(rg.r2, Math.max(rg.r1, u.rows - 1)), c2: Math.min(rg.c2, Math.max(rg.c1, u.cols - 1)) } : undefined;
    return buildPrintHtml(wb, sh, { orientation: landscape ? 'landscape' : 'portrait', gridlines: grid, fitWidth: fit, title: docTitle, showTitle: title, range });
  }, [wb, sh, landscape, grid, fit, title, onlySel, hasSel, rg, docTitle]);

  const close = () => {
    setState({ panel: null });
    focusGrid();
  };

  const doPrint = async () => {
    setBusy(true);
    const r = await window.api.print(html, { landscape });
    setBusy(false);
    if (r.ok) {
      toast('Enviado para a impressora.', 'success');
      close();
    } else if (!r.canceled) await alertMsg('Não foi possível imprimir', r.message, 'warn');
  };
  const doPdf = async () => {
    const d = await window.api.saveDialog(docTitle.replace(/[—]/g, '-'), 'pdf');
    if (!d.ok) return;
    setBusy(true);
    setState({ busy: 'Gerando o PDF…' });
    const r = await window.api.exportPdf(d.path, html, { landscape });
    setState({ busy: null });
    setBusy(false);
    if (r.ok) {
      toast('PDF salvo.', 'success');
      void window.api.showInFolder(d.path);
      close();
    } else await alertMsg('Não foi possível gerar o PDF', r.message, 'warn');
  };

  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const scale = 0.5;

  return (
    <Modal
      title={mode === 'pdf' ? 'Exportar como PDF' : 'Imprimir'}
      onClose={close}
      width="w-[min(1000px,96vw)]"
      testId="print-panel"
      footer={
        <>
          <button className={btnClass()} onClick={close}>Cancelar</button>
          <button className={btnClass(mode === 'pdf' ? 'primary' : 'normal')} disabled={busy} onClick={() => void doPdf()} data-testid="btn-save-pdf">
            <span className="flex items-center gap-2"><FileDown className="h-4 w-4" /> Salvar PDF</span>
          </button>
          <button className={btnClass(mode === 'print' ? 'primary' : 'normal')} disabled={busy} onClick={() => void doPrint()} data-testid="btn-do-print">
            <span className="flex items-center gap-2"><Printer className="h-4 w-4" /> Imprimir…</span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="w-full space-y-3 md:w-[260px]">
          <div>
            <div className="mb-1 font-medium text-gray-800">Orientação da página</div>
            <div className="flex gap-2">
              <button className={`flex-1 rounded-lg border px-2 py-2 text-sm ${!landscape ? 'border-brand-500 bg-brand-50 font-medium' : 'border-gray-200'}`} onClick={() => setLandscape(false)}>
                Retrato
              </button>
              <button className={`flex-1 rounded-lg border px-2 py-2 text-sm ${landscape ? 'border-brand-500 bg-brand-50 font-medium' : 'border-gray-200'}`} onClick={() => setLandscape(true)}>
                Paisagem
              </button>
            </div>
          </div>
          <Check checked={fit} onChange={setFit} label="Caber na largura da página" />
          <Check checked={grid} onChange={setGrid} label="Mostrar as linhas de grade" />
          <Check checked={title} onChange={setTitle} label="Colocar título no topo" />
          {hasSel && <Check checked={onlySel} onChange={setOnlySel} label={`Só a seleção (${rangeToA1(rg)})`} />}
          <p className="pt-2 text-sm text-gray-500">Será impressa a aba <b>{sh.name}</b>{getState().wb!.sheets.length > 1 ? ' (as outras abas não entram)' : ''}.</p>
        </div>
        <div className="flex flex-1 justify-center overflow-auto rounded-xl bg-gray-200 p-4" style={{ maxHeight: '62vh' }}>
          <div className="shrink-0 bg-white shadow-lg" style={{ width: `${pageW * scale * 3.78}px`, height: `${pageH * scale * 3.78}px`, overflow: 'hidden' }}>
            <iframe
              title="Pré-visualização"
              sandbox=""
              srcDoc={html}
              style={{ width: `${pageW * 3.78}px`, height: `${pageH * 3.78}px`, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, padding: `${12 * 3.78}px`, boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
