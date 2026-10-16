// Painéis menores: remover duplicados, avisos do arquivo, configurações e inserir função.

import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { colToLetters, rangeToA1 } from '../../core/address';
import { removeDuplicates } from '../../core/ops';
import { startAutosave } from '../actions/document';
import { focusGrid, selectionOrRegion, startEdit } from '../actions/editing';
import { btnClass } from '../dialogs';
import { Check, Modal } from '../components/ui';
import { FUNCS, FuncDoc } from '../functionsCatalog';
import { gridBus } from '../grid/bus';
import { currentSheet, getState, setState, toast, useApp } from '../store';

const closePanel = () => {
  setState({ panel: null });
  focusGrid();
};

export function DedupePanel() {
  const wb = useApp((s) => s.wb)!;
  const sh = currentSheet()!;
  const region = useMemo(() => selectionOrRegion(), []);
  const cols = useMemo(() => Array.from({ length: region.c2 - region.c1 + 1 }, (_, i) => region.c1 + i), [region]);
  const [hasHeader, setHasHeader] = useState(() => typeof wb.value(sh, region.r1, region.c1) === 'string');
  const [chosen, setChosen] = useState<Set<number>>(new Set(cols));
  const label = (c: number) => {
    const h = hasHeader ? wb.value(sh, region.r1, c) : null;
    return typeof h === 'string' && h ? `${h} (coluna ${colToLetters(c)})` : `Coluna ${colToLetters(c)}`;
  };
  return (
    <Modal
      title="Remover duplicados"
      onClose={closePanel}
      testId="dedupe-panel"
      footer={
        <>
          <button className={btnClass()} onClick={closePanel}>Cancelar</button>
          <button
            className={btnClass('primary')}
            disabled={!chosen.size}
            data-testid="dedupe-ok"
            onClick={() => {
              const n = removeDuplicates(wb, sh, region, [...chosen], hasHeader);
              toast(n ? `${n} linha(s) repetida(s) removida(s). Ctrl+Z desfaz.` : 'Nenhuma linha repetida encontrada.', n ? 'success' : 'info', 4000);
              closePanel();
            }}
          >
            Remover repetidos
          </button>
        </>
      }
    >
      <p className="text-gray-700">
        Tabela: <b>{rangeToA1(region)}</b>. Linhas iguais nas colunas marcadas serão removidas (a primeira fica).
      </p>
      <Check checked={hasHeader} onChange={setHasHeader} label="A primeira linha é o cabeçalho" />
      <div className="mt-2 max-h-[260px] overflow-y-auto rounded-lg border border-gray-200 p-2">
        {cols.map((c) => (
          <Check
            key={c}
            checked={chosen.has(c)}
            onChange={(v) => {
              const n = new Set(chosen);
              v ? n.add(c) : n.delete(c);
              setChosen(n);
            }}
            label={label(c)}
          />
        ))}
      </div>
    </Modal>
  );
}

export function WarningsPanel() {
  const warnings = useApp((s) => s.meta.warnings);
  const name = useApp((s) => s.meta.fileName);
  return (
    <Modal title="Avisos sobre este arquivo" onClose={closePanel} testId="warnings-panel" footer={<button className={btnClass('primary')} onClick={closePanel}>Entendi</button>}>
      <p className="mb-3 text-gray-700">
        <b>{name}</b> foi aberto, mas tem recursos que o Excel Fácil não suporta. Os valores aparecem normalmente. Para não perder nada do original, use <b>Salvar como</b> e grave uma cópia.
      </p>
      <ul className="space-y-2">
        {warnings.map((w, i) => (
          <li key={i} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-[0.92rem] text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {w}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function SettingsPanel() {
  const settings = useApp((s) => s.settings);
  const [local, setLocal] = useState(settings);
  const apply = async () => {
    const next = await window.api.settingsSet(local);
    setState({ settings: next });
    document.documentElement.classList.toggle('ui-grande', next.uiScale === 'grande');
    if (getState().screen === 'editor') startAutosave();
    toast('Configurações salvas.', 'success');
    closePanel();
  };
  return (
    <Modal
      title="Configurações"
      onClose={closePanel}
      testId="settings-panel"
      footer={
        <>
          <button className={btnClass()} onClick={closePanel}>Cancelar</button>
          <button className={btnClass('primary')} onClick={() => void apply()} data-testid="settings-save">Salvar</button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="font-medium text-gray-800">Tamanho dos botões e textos</div>
          <div className="mt-2 flex gap-2">
            {(['normal', 'grande'] as const).map((v) => (
              <button key={v} className={`flex-1 rounded-lg border px-3 py-2 ${local.uiScale === v ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-gray-200'}`} onClick={() => setLocal({ ...local, uiScale: v })}>
                {v === 'normal' ? 'Normal' : 'Grande (mais fácil de ler)'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="font-medium text-gray-800">Cópia de segurança automática</div>
          <p className="text-sm text-gray-500">Enquanto você trabalha, uma cópia é guardada para recuperar o trabalho se o computador desligar. Ela não altera o seu arquivo.</p>
          <select className="mt-2 h-10 rounded-lg border border-gray-300 px-2" value={local.autosaveSeconds} onChange={(e) => setLocal({ ...local, autosaveSeconds: +e.target.value })}>
            {[15, 30, 60, 120, 300].map((s) => (
              <option key={s} value={s}>
                A cada {s < 60 ? `${s} segundos` : `${s / 60} minuto${s > 60 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="font-medium text-gray-800">Zoom inicial da planilha</div>
          <select className="mt-2 h-10 rounded-lg border border-gray-300 px-2" value={local.defaultZoom} onChange={(e) => setLocal({ ...local, defaultZoom: +e.target.value })}>
            {[80, 90, 100, 110, 125, 150].map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
        </div>
        <Check checked={local.showWelcomeTips} onChange={(v) => setLocal({ ...local, showWelcomeTips: v })} label="Mostrar dicas para iniciantes ao abrir uma planilha" />
      </div>
    </Modal>
  );
}

export function FunctionsPanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Todas');
  const cats = ['Todas', ...new Set(FUNCS.map((f) => f.cat))];
  const list = FUNCS.filter((f) => (cat === 'Todas' || f.cat === cat) && (f.pt.toLowerCase().includes(q.toLowerCase()) || f.desc.toLowerCase().includes(q.toLowerCase())));
  const [pick, setPick] = useState<FuncDoc | null>(null);
  const insert = (f: FuncDoc) => {
    setState({ panel: null });
    const st = getState();
    if (st.editing && st.editing.text.startsWith('=')) {
      gridBus.setEditorText(st.editing.text + f.pt + '(');
    } else {
      startEdit('enter', `=${f.pt}(`);
      setTimeout(() => {
        gridBus.setEditorText(`=${f.pt}(`);
        document.getElementById('cell-editor')?.focus();
      }, 0);
    }
    toast('Agora selecione as células (clique e arraste) e aperte Enter.', 'info', 4500);
  };
  return (
    <Modal
      title="Inserir função"
      onClose={closePanel}
      width="w-[min(760px,94vw)]"
      testId="functions-panel"
      footer={
        <>
          <button className={btnClass()} onClick={closePanel}>Cancelar</button>
          <button className={btnClass('primary')} disabled={!pick} onClick={() => pick && insert(pick)}>
            Usar {pick?.pt ?? 'função'}
          </button>
        </>
      }
    >
      <div className="flex gap-2">
        <input autoFocus className="h-10 flex-1 rounded-lg border border-gray-300 px-3" placeholder="Procure: soma, média, texto, data…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-10 rounded-lg border border-gray-300 px-2" value={cat} onChange={(e) => setCat(e.target.value)}>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="mt-3 grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
        {list.map((f) => (
          <button
            key={f.pt}
            className={`rounded-xl border p-3 text-left ${pick === f ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}
            onClick={() => setPick(f)}
            onDoubleClick={() => insert(f)}
          >
            <div className="font-semibold text-brand-800">{f.pt}</div>
            <div className="text-sm text-gray-600">{f.desc}</div>
            <div className="mt-1 font-mono text-xs text-gray-500">{f.example}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
